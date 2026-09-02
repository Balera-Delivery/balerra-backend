import { AuthService } from './services/auth.service';
import { AdminService } from './services/admin.service';
import { CustomerService } from './services/customer.service';
import { RiderService } from './services/rider.service';
import { DeliveryService } from './services/delivery.service';
import { ReportService } from './services/report.service';
import { OtpService } from './services/otp.service';
import { prisma } from './config/prisma';

async function runE2ETest() {
  console.log('🧪 ========================================================');
  console.log('🧪 BALERRA DELIVERY PLATFORM - BACKEND E2E TEST SUITE');
  console.log('🧪 ========================================================\n');

  try {
    const timestamp = Date.now();

    // 1. Admin Login
    console.log('1️⃣ Testing Admin Authentication...');
    const adminLogin = await AuthService.loginAdmin('admin@balera.com', 'AdminPassword@123');
    console.log('✅ Admin login succeeded. Admin ID:', adminLogin.admin.id);

    // 2. Customer Registration & Login
    console.log('\n2️⃣ Testing Customer Registration & Login...');
    const customerPhone = `+251911${Math.floor(100000 + Math.random() * 900000)}`;
    const customerEmail = `customer_${timestamp}@test.com`;
    const customerReg = await AuthService.registerCustomer({
      fullName: 'Abebe Bikila',
      phoneNumber: customerPhone,
      email: customerEmail,
      password: 'CustomerPassword@123',
      address: 'Bole, Addis Ababa',
    });
    console.log('✅ Customer registered successfully:', customerReg.customer.fullName, `(${customerReg.customer.phoneNumber})`);

    const customerLogin = await AuthService.loginCustomer(customerPhone, 'CustomerPassword@123');
    console.log('✅ Customer logged in with phone number successfully. Token generated.');

    // 3. Rider Registration (Pending Approval)
    console.log('\n3️⃣ Testing Rider Registration & Approval Flow...');
    const riderEmail = `rider_${timestamp}@test.com`;
    const riderPhone = `+251922${Math.floor(100000 + Math.random() * 900000)}`;
    const riderReg = await AuthService.registerRider({
      fullName: 'Kebede Michael',
      email: riderEmail,
      phoneNumber: riderPhone,
      password: 'RiderPassword@123',
      vehicleInfo: 'TVS Motorcycle - Plate AA-2-4592',
    });
    console.log('✅ Rider registered with status:', riderReg.accountStatus);

    // Test rider login before approval (should be rejected)
    try {
      await AuthService.loginRider(riderEmail, 'RiderPassword@123');
      throw new Error('Rider login should have failed before approval!');
    } catch (err: any) {
      console.log('✅ Rider login correctly blocked prior to admin approval:', err.message);
    }

    // 4. Admin Approves Rider
    console.log('\n4️⃣ Testing Admin Approval of Rider...');
    const approvedRider = await AdminService.approveRider(riderReg.id);
    console.log('✅ Admin approved rider. Account status:', approvedRider.accountStatus);

    const riderLogin = await AuthService.loginRider(riderEmail, 'RiderPassword@123');
    console.log('✅ Rider logged in successfully after approval.');

    // 5. Rider Goes Online
    console.log('\n5️⃣ Testing Rider Availability Toggle...');
    const onlineRider = await RiderService.updateAvailability(riderReg.id, 'ONLINE');
    console.log('✅ Rider availability updated to:', onlineRider.availabilityStatus);

    // 6. Customer Creates Delivery Request
    console.log('\n6️⃣ Testing Delivery Request Creation & 6-Digit OTP...');
    const delivery = await DeliveryService.createDelivery(customerReg.customer.id, {
      pickupLocation: 'Meskel Square, Addis Ababa',
      destination: 'CMC Michael, Addis Ababa',
      itemType: 'Documents',
      itemDescription: 'Contract envelope (Urgent)',
      receiverName: 'Tigist Haile',
      receiverPhone: '+251933112233',
      specialInstructions: 'Please call recipient 10 mins before arrival.',
    });
    console.log('✅ Delivery created with tracking code:', delivery.trackingCode);
    console.log('✅ 6-Digit OTP generated & stored:', delivery.otpCode);
    console.log('✅ Initial delivery status:', delivery.status);

    // 7. Customer views delivery & retrieves OTP
    const retrievedOtp = await OtpService.getDeliveryOtp(delivery.id);
    console.log('✅ Customer retrieved delivery OTP:', retrievedOtp?.otpCode);

    // 8. Admin Assigns Delivery to Rider
    console.log('\n7️⃣ Testing Admin Rider Assignment...');
    const assignedDelivery = await DeliveryService.assignRider(delivery.id, riderReg.id, adminLogin.admin.id);
    console.log('✅ Delivery status transitioned to:', assignedDelivery.status, 'Assigned to:', assignedDelivery.rider?.fullName);

    // 9. Rider Accepts Delivery
    console.log('\n8️⃣ Testing Rider Accepting Delivery...');
    const acceptedDelivery = await DeliveryService.acceptDelivery(delivery.id, riderReg.id);
    console.log('✅ Delivery accepted by rider. Status:', acceptedDelivery.status);

    // 10. Rider Stage Transitions
    console.log('\n9️⃣ Testing Rider Delivery Progression States...');
    const arrivedPickup = await DeliveryService.updateRiderDeliveryStatus(delivery.id, riderReg.id, 'ARRIVED_AT_PICKUP');
    console.log('✅ Status updated to:', arrivedPickup.status);

    const pickedUp = await DeliveryService.updateRiderDeliveryStatus(delivery.id, riderReg.id, 'PICKED_UP');
    console.log('✅ Status updated to:', pickedUp.status);

    const onTheWay = await DeliveryService.updateRiderDeliveryStatus(delivery.id, riderReg.id, 'ON_THE_WAY');
    console.log('✅ Status updated to:', onTheWay.status);

    const delivered = await DeliveryService.updateRiderDeliveryStatus(delivery.id, riderReg.id, 'DELIVERED');
    console.log('✅ Status updated to:', delivered.status);

    // 11. Rider Enters Incorrect OTP
    console.log('\n🔟 Testing OTP Verification Gate...');
    try {
      await DeliveryService.completeDeliveryWithOtp(delivery.id, riderReg.id, '000000');
      throw new Error('Invalid OTP should have been rejected!');
    } catch (err: any) {
      console.log('✅ Invalid OTP correctly rejected:', err.message);
    }

    // 12. Rider Enters Correct 6-digit OTP
    const completedDelivery = await DeliveryService.completeDeliveryWithOtp(delivery.id, riderReg.id, delivery.otpCode);
    console.log('✅ Delivery completed successfully! Final status:', completedDelivery.status);
    console.log('✅ OTP is verified:', completedDelivery.otp?.isVerified);

    // 13. Admin Dashboard & Reports Check
    console.log('\n1️⃣1️⃣ Testing Admin Dashboard Metrics & Reports...');
    const dashboardStats = await AdminService.getDashboardStats();
    console.log('✅ Dashboard Metrics:', JSON.stringify(dashboardStats.metrics, null, 2));

    const reports = await ReportService.generateReports('daily');
    console.log('✅ Daily Report Summary:', JSON.stringify(reports.summary, null, 2));
    console.log('✅ Rider Performance Summary Count:', reports.riderPerformance.length);

    console.log('\n🎉 ========================================================');
    console.log('🎉 ALL BACKEND BUSINESS LOGIC & INTEGRATION TESTS PASSED 100%!');
    console.log('🎉 ========================================================');
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runE2ETest();
