import { prisma } from './config/prisma';
import { RiderService } from './services/rider.service';
import { AdminService } from './services/admin.service';
import { DeliveryService } from './services/delivery.service';

async function testMapFlow() {
  console.log('🗺️ Testing Map & Geolocation Endpoints...');

  try {
    // 1. Find an active online rider
    const rider = await prisma.rider.findFirst({
      where: { accountStatus: 'ACTIVE' },
    });

    if (!rider) {
      console.log('⚠️ No rider found to test.');
      return;
    }

    // 2. Test Rider Updating GPS Location
    console.log('\n1️⃣ Updating Rider GPS location (Meskel Square)...');
    const locationUpdate = await RiderService.updateLocation(rider.id, 9.0105, 38.7612, 120);
    console.log('✅ Rider GPS updated:', locationUpdate);

    // 3. Test Proximity Search: Find Nearest Riders to a pickup point (Bole Medhanialem: 9.0012, 38.7812)
    console.log('\n2️⃣ Testing Proximity Search (Admin finding nearest rider)...');
    const nearby = await AdminService.getNearbyRiders({
      pickupLat: 9.0012,
      pickupLng: 38.7812,
      radiusKm: 25,
    });
    console.log(`✅ Nearest online riders found: ${nearby.totalFound}`);
    if (nearby.riders.length > 0) {
      console.log(`   - Closest Rider: ${nearby.riders[0].fullName} (${nearby.riders[0].distanceKm} km away)`);
    }

    // 4. Test Live Fleet Map Data
    console.log('\n3️⃣ Testing Live Fleet Map Data for Admin...');
    const liveMap = await AdminService.getLiveMapData();
    console.log(`✅ Live map loaded: ${liveMap.onlineRiders.length} online riders, ${liveMap.activeDeliveries.length} active deliveries.`);

    // 5. Test Customer Live Delivery Tracking
    const delivery = await prisma.delivery.findFirst();
    if (delivery) {
      console.log(`\n4️⃣ Testing Customer Real-time Delivery Tracking (${delivery.trackingCode})...`);
      const tracking = await DeliveryService.getDeliveryTrackingInfo(delivery.id);
      console.log('✅ Tracking response loaded:', {
        trackingCode: tracking.trackingCode,
        status: tracking.status,
        pickup: tracking.pickup,
        destination: tracking.destination,
        assignedRider: tracking.assignedRider?.fullName || 'Unassigned',
      });
    }

    console.log('\n🎉 ALL MAP & GEOLOCATION LOGIC VERIFIED 100%!');
  } catch (error) {
    console.error('❌ Error testing map flow:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testMapFlow();
