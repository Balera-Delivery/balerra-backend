import { prisma } from '../config/prisma';

export class ReportService {
  /**
   * Generate Comprehensive Operational Reports (SRS Chapter 10.10)
   */
  static async generateReports(period: 'daily' | 'weekly' | 'monthly' | 'all' = 'all') {
    const now = new Date();
    let startDate: Date | undefined;

    if (period === 'daily') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'weekly') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'monthly') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const dateFilter = startDate ? { createdAt: { gte: startDate } } : {};

    // 1. Overall Delivery Metrics for period
    const [
      totalRequested,
      completedCount,
      cancelledCount,
      pendingCount,
      activeCount,
    ] = await Promise.all([
      prisma.delivery.count({ where: dateFilter }),
      prisma.delivery.count({ where: { ...dateFilter, status: 'COMPLETED' } }),
      prisma.delivery.count({ where: { ...dateFilter, status: 'CANCELLED' } }),
      prisma.delivery.count({ where: { ...dateFilter, status: 'PENDING' } }),
      prisma.delivery.count({
        where: {
          ...dateFilter,
          status: { in: ['ASSIGNED', 'ACCEPTED', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'ON_THE_WAY', 'DELIVERED'] },
        },
      }),
    ]);

    const completionRate = totalRequested > 0 ? ((completedCount / totalRequested) * 100).toFixed(2) + '%' : '0%';
    const cancellationRate = totalRequested > 0 ? ((cancelledCount / totalRequested) * 100).toFixed(2) + '%' : '0%';

    // 2. Rider Performance Summary
    const riders = await prisma.rider.findMany({
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        availabilityStatus: true,
        accountStatus: true,
        deliveries: {
          where: dateFilter,
          select: { status: true },
        },
      },
    });

    const riderPerformance = riders.map((r) => {
      const assigned = r.deliveries.length;
      const completed = r.deliveries.filter((d) => d.status === 'COMPLETED').length;
      const cancelled = r.deliveries.filter((d) => d.status === 'CANCELLED').length;
      const successRate = assigned > 0 ? ((completed / assigned) * 100).toFixed(1) + '%' : '0%';

      return {
        riderId: r.id,
        name: r.fullName,
        email: r.email,
        phone: r.phoneNumber,
        availability: r.availabilityStatus,
        status: r.accountStatus,
        totalAssigned: assigned,
        completedDeliveries: completed,
        cancelledDeliveries: cancelled,
        successRate,
      };
    });

    return {
      period,
      summary: {
        totalRequested,
        completedCount,
        cancelledCount,
        pendingCount,
        activeCount,
        completionRate,
        cancellationRate,
      },
      riderPerformance,
      generatedAt: new Date(),
    };
  }
}
