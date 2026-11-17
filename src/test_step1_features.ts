import { prisma } from './config/prisma';
import { AuthService } from './services/auth.service';
import { DeliveryService } from './services/delivery.service';
import { RiderService } from './services/rider.service';
import { AdminService } from './services/admin.service';
import { NotificationService } from './services/notification.service';
import { EmailUtils } from './utils/email.utils';
import { Roles } from './constants/roles';

async function runStep1Verification() {
  console.log('====================================================');
  console.log('   BALERA DELIVERY - STEP 1 COMPREHENSIVE TEST SUITE');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, extra?: any) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`✅ [PASS] ${testName}`);
    } else {
      console.error(`❌ [FAIL] ${testName}`, extra ? extra : '');
    }
  }

  const timestamp = Date.now();
  const testCustomerPhone = `+251911${String(timestamp).slice(-6)}`;
  const testRiderPhone = `+251922${String(timestamp).slice(-6)}`;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Customer Phone-first Registration (No Email required)
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Testing Customer Registration (Phone + Name + Password) ---');
    const customerRes = await AuthService.registerCustomer({
      fullName: 'Abebe Customer',
      phoneNumber: testCustomerPhone,
      password: 'Password123!',
      address: 'Robe Main Street, Zone 1',
    });
    assert(!!customerRes && customerRes.customer.phoneNumber === testCustomerPhone, 'Customer registered without email', { id: customerRes.customer.id });

    // -------------------------------------------------------------------------
    // TEST 2: Customer Phone Login
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Testing Customer Phone Login ---');
    const customerLogin = await AuthService.loginCustomer(testCustomerPhone, 'Password123!');
    assert(!!customerLogin.token && customerLogin.customer.fullName === 'Abebe Customer', 'Customer logged in with phone + password');

    // -------------------------------------------------------------------------
    // TEST 3: Rider Registration with Phone, Name, Password (Email Optional)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Testing Rider Registration (Phone-first, optional email) ---');
    const rider = await AuthService.registerRider({
      fullName: 'Chala Rider',
      phoneNumber: testRiderPhone,
      password: 'Password123!',
      vehicleInfo: 'Bajaj Red Plate 2345',
    });
    assert(!!rider && rider.phoneNumber === testRiderPhone, 'Rider registered without email');

    // Verify SMS OTP was generated
    const otpRecord = await prisma.phoneVerification.findFirst({
      where: { phoneNumber: testRiderPhone },
      orderBy: { createdAt: 'desc' },
    });
    assert(!!otpRecord && otpRecord.code.length === 6, 'SMS OTP generated in database for rider verification', { code: otpRecord?.code });

    // -------------------------------------------------------------------------
    // TEST 4: Rider Phone Verification via SMS OTP
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Testing Rider Phone Verification via OTP ---');
    if (otpRecord) {
      const verifyRes = await AuthService.verifyPhoneOtp(testRiderPhone, otpRecord.code);
      assert(verifyRes.success === true, 'Rider phone successfully verified with SMS OTP');
    }

    // Activate rider for testing
    await prisma.rider.update({
      where: { id: rider.id },
      data: { accountStatus: 'ACTIVE', availabilityStatus: 'ONLINE' },
    });

    // -------------------------------------------------------------------------
    // TEST 5: Rider Phone Login & Soft-Delete / Deactivation Guard
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Testing Rider Login & Security Guards ---');
    const riderLogin = await AuthService.loginRider(testRiderPhone, 'Password123!');
    assert(!!riderLogin.token && riderLogin.rider.id === rider.id, 'Rider logged in successfully with phone');

    // Test Deactivation guard
    await AdminService.toggleRiderDeactivation(rider.id, true);
    let deactBlocked = false;
    try {
      await AuthService.loginRider(testRiderPhone, 'Password123!');
    } catch (err: any) {
      deactBlocked = err.message.includes('deactivated');
    }
    assert(deactBlocked, 'Deactivated rider is blocked from logging in');

    // Reactivate rider
    await AdminService.toggleRiderDeactivation(rider.id, false);
    const reactLogin = await AuthService.loginRider(testRiderPhone, 'Password123!');
    assert(!!reactLogin.token, 'Reactivated rider can log in again');

    // -------------------------------------------------------------------------
    // TEST 6: Price Tampering Prevention & DB Price Enforcement
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Testing Order Creation & Server-side Price Tampering Check ---');
    const restaurant = await prisma.restaurant.findFirst({
      include: { foods: true },
    });
    assert(!!restaurant && restaurant.foods.length > 0, 'Seed restaurant with food items exists', { restaurant: restaurant?.name });

    const foodItem = restaurant!.foods[0];
    const realPrice = foodItem.price;
    const fakePrice = 0.01; // Malicious client attempt

    const deliveryWithOrder = await DeliveryService.createDelivery(
      customerRes.customer.id,
      {
        pickupLocation: restaurant!.name,
        destination: 'Robe University Gate 1',
        itemType: 'Food Delivery',
        itemDescription: `1x ${foodItem.name}`,
        receiverName: 'Abebe Receiver',
        receiverPhone: testCustomerPhone,
        restaurantId: restaurant!.id,
        items: [
          {
            foodItemId: foodItem.id,
            name: foodItem.name,
            price: fakePrice, // Client sends fake 0.01
            quantity: 2,
          },
        ],
      }
    );

    const createdOrder = await prisma.order.findUnique({
      where: { deliveryId: deliveryWithOrder.id },
      include: { items: true },
    });

    const expectedSubtotal = realPrice * 2;
    assert(
      createdOrder?.subtotal === expectedSubtotal,
      `Price tampering prevented: Server calculated subtotal as ${createdOrder?.subtotal} ETB based on DB price (${realPrice} x 2) instead of client fake price (${fakePrice})`
    );

    // -------------------------------------------------------------------------
    // TEST 7: Delivery QR Code Token Generation
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Testing QR Code Token Generation on Delivery ---');
    assert(
      !!deliveryWithOrder.qrCodeToken && deliveryWithOrder.qrCodeToken.startsWith('BALERA-'),
      `Delivery has unique QR Code token generated: ${deliveryWithOrder.qrCodeToken}`
    );

    // -------------------------------------------------------------------------
    // TEST 8: QR Code Verification for Delivery Completion
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Testing QR Code Verification for Delivery Completion ---');
    // Assign delivery to rider and set to ON_THE_WAY
    await prisma.delivery.update({
      where: { id: deliveryWithOrder.id },
      data: {
        riderId: rider.id,
        status: 'ON_THE_WAY',
      },
    });

    const qrResult = await DeliveryService.completeDeliveryWithQr(
      deliveryWithOrder.id,
      rider.id,
      deliveryWithOrder.qrCodeToken!
    );
    assert(qrResult.status === 'COMPLETED' || qrResult.status === 'DELIVERED', 'Delivery verified and marked COMPLETED via QR code scan');

    // -------------------------------------------------------------------------
    // TEST 9: Rider Delivery History (DELIVERED + COMPLETED with Partners & Items)
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Testing Rider Delivery History ---');
    const riderHistory = await RiderService.getDeliveryHistory(rider.id);
    const historyItem = riderHistory.deliveries.find((d: any) => d.id === deliveryWithOrder.id);
    assert(
      riderHistory.deliveries.length > 0 && !!historyItem,
      'Rider delivery history returns completed/delivered deliveries with restaurant and items info'
    );

    // -------------------------------------------------------------------------
    // TEST 10: Rider Earnings & Admin Payout Settlement
    // -------------------------------------------------------------------------
    console.log('\n--- 10. Testing Rider Earnings & Admin Payout Settlement ---');
    const earningsBefore = await RiderService.getEarningsSummary(rider.id);
    assert(earningsBefore.totalEarned > 0 && earningsBefore.amountOwed > 0, 'Rider earnings calculated correctly', earningsBefore);

    const payoutResult = await AdminService.markRiderPaid(rider.id, [deliveryWithOrder.id], 'TEST-PAYOUT-001');
    assert(payoutResult.count === 1 && payoutResult.totalAmount > 0, 'Admin marked rider delivery as paid with reference', payoutResult);

    const earningsAfter = await RiderService.getEarningsSummary(rider.id);
    assert(earningsAfter.amountOwed === 0 && earningsAfter.totalPaid > 0, 'Rider amount owed is now 0 after payout settlement');

    // -------------------------------------------------------------------------
    // TEST 11: Payment Settings (Bank Account & Mobile Payment Phone)
    // -------------------------------------------------------------------------
    console.log('\n--- 11. Testing Payment Settings (Bank & Mobile Money) ---');
    await AdminService.updatePaymentSettings({
      bankName: 'Commercial Bank of Ethiopia',
      bankAccountNumber: '1000123456789',
      bankAccountHolder: 'Balera Express Logistics PLC',
      mobileMoneyProvider: 'Telebirr / CBE Birr',
      mobileMoneyNumber: '+251911998877',
      mobileMoneyName: 'Balera Delivery',
    });

    const paymentSettings = await AdminService.getPaymentSettings();
    assert(
      paymentSettings.bankName === 'Commercial Bank of Ethiopia' && paymentSettings.mobileMoneyNumber === '+251911998877',
      'Admin updated and retrieved Bank & Mobile Money settlement settings'
    );

    // -------------------------------------------------------------------------
    // TEST 12: Customer Management Privacy (Name & Phone only, Email removed)
    // -------------------------------------------------------------------------
    console.log('\n--- 12. Testing Customer Management Privacy ---');
    const customersList = await AdminService.getCustomers({ search: 'Abebe Customer' });
    const fetchedCustomer = customersList.customers[0];
    assert(
      !!fetchedCustomer && fetchedCustomer.phoneNumber === testCustomerPhone && !('email' in fetchedCustomer),
      'Customer list returns only Name & Phone number, email is removed'
    );

    // -------------------------------------------------------------------------
    // TEST 13: Notification Deletion
    // -------------------------------------------------------------------------
    console.log('\n--- 13. Testing Notification Deletion ---');
    const notif = await NotificationService.sendNotification({
      role: Roles.CUSTOMER,
      recipientId: customerRes.customer.id,
      title: 'Order Status Update',
      message: 'Your rider is on the way!',
    });

    await NotificationService.deleteNotification(notif.id, customerRes.customer.id, Roles.CUSTOMER);
    const userNotifs = await NotificationService.getUserNotifications(customerRes.customer.id, Roles.CUSTOMER);
    assert(!userNotifs.notifications.some((n: any) => n.id === notif.id), 'Customer can delete notification');

    // -------------------------------------------------------------------------
    // TEST 14: Reports Generation and Multi-Format Export (CSV, Excel, PDF)
    // -------------------------------------------------------------------------
    console.log('\n--- 14. Testing Deliveries Report & Export (CSV, Excel, PDF) ---');
    const deliveriesReport = await AdminService.getDeliveriesReport({ status: 'completed' });
    assert(deliveriesReport.deliveries.length > 0, 'Admin can filter deliveries report by status (completed)');

    const csvExport = await AdminService.exportDeliveriesReport({ format: 'csv', status: 'completed' });
    assert(csvExport.data.length > 0 && csvExport.filename.endsWith('.csv'), 'CSV report exported successfully');

    const excelExport = await AdminService.exportDeliveriesReport({ format: 'excel', status: 'completed' });
    assert(excelExport.data.length > 0 && excelExport.filename.endsWith('.xlsx'), 'Excel (.xlsx) report exported successfully');

    const pdfExport = await AdminService.exportDeliveriesReport({ format: 'pdf', status: 'completed' });
    assert(pdfExport.data.length > 0 && pdfExport.filename.endsWith('.pdf'), 'PDF report exported successfully');

    // -------------------------------------------------------------------------
    // TEST 15: Resend Email Notifications Utility
    // -------------------------------------------------------------------------
    console.log('\n--- 15. Testing Email Notifications Utility (Resend) ---');
    const emailResult = await EmailUtils.sendStaffAlert({
      to: 'admin@baleradelivery.com',
      subject: 'New Daily Settlement Report',
      html: '<h1>Daily Settlement Summary</h1><p>All riders have been settled.</p>',
    });
    assert(emailResult.success === true, 'Email utility executed cleanly (with Resend or graceful mock fallback)');

    // -------------------------------------------------------------------------
    // TEST 16: Soft Delete Rider (Login blocked, history preserved)
    // -------------------------------------------------------------------------
    console.log('\n--- 16. Testing Soft Delete Rider ---');
    await AdminService.softDeleteRider(rider.id);
    let deletedRiderLoginBlocked = false;
    try {
      await AuthService.loginRider(testRiderPhone, 'Password123!');
    } catch (err: any) {
      deletedRiderLoginBlocked = err.message.includes('removed');
    }
    assert(deletedRiderLoginBlocked, 'Soft-deleted rider cannot log in');

    // Verify delivery history is still preserved in DB
    const preservedDeliveries = await prisma.delivery.findMany({ where: { riderId: rider.id } });
    assert(preservedDeliveries.length > 0, 'Rider old delivery history remains preserved in database after soft deletion');

    // Clean up test records
    await prisma.phoneVerification.deleteMany({ where: { phoneNumber: { in: [testCustomerPhone, testRiderPhone] } } });
    await prisma.orderItem.deleteMany({ where: { order: { deliveryId: deliveryWithOrder.id } } });
    await prisma.order.deleteMany({ where: { deliveryId: deliveryWithOrder.id } });
    await prisma.deliveryStatusLog.deleteMany({ where: { deliveryId: deliveryWithOrder.id } });
    await prisma.delivery.deleteMany({ where: { id: deliveryWithOrder.id } });
    await prisma.rider.deleteMany({ where: { id: rider.id } });
    await prisma.customer.deleteMany({ where: { id: customerRes.customer.id } });

  } catch (error: any) {
    console.error('Unexpected error during verification:', error);
  } finally {
    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
    console.log('====================================================');
    await prisma.$disconnect();
    if (passedTests === totalTests && totalTests > 0) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  }
}

runStep1Verification();
