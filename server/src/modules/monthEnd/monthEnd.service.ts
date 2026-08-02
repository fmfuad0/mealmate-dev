import { Types } from 'mongoose';
import { CycleStatus, DepositType, MembershipStatus, NotificationType, WalletTxnSource } from '../../config/enums';
import { ApiError } from '../../utils/ApiError';
import { withTransaction } from '../../utils/transaction';
import { dueService } from '../dues/due.service';
import { Home } from '../homes/home.model';
import { Membership } from '../memberships/membership.model';
import { MonthCycle } from './monthEnd.model';
import { Deposit } from '../deposits/deposit.model';
import { walletService } from '../wallet/wallet.service';
import { notificationService } from '../notifications/notification.service';
import { auditLogService } from '../auditLog/auditLog.service';

/** Advance YYYY-MM by one month */
function nextCycle(cycle: string): string {
  const [y, m] = cycle.split('-').map(Number);
  const d = new Date(y, m, 1); // month is 0-indexed in Date, so m (1-based) = next month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const monthEndService = {
  async close(
    homeId: Types.ObjectId,
    cycle: string,
    actorUserId: Types.ObjectId,
    actorName: string,
  ) {
    // Guard: prevent double-close
    const existing = await MonthCycle.findOne({ homeId, cycle });
    if (existing?.status === CycleStatus.Closed) {
      throw ApiError.conflict(`Cycle ${cycle} is already closed.`);
    }

    const next = nextCycle(cycle);

    // Compute final dues snapshot using the independent due calculator
    const dues = await dueService.compute(homeId, cycle);

    const totalCharge = dues.members.reduce((s, m) => s + m.charge, 0);
    const totalCredit = dues.members.reduce((s, m) => s + m.credit, 0);
    const totalOutstanding = dues.members
      .filter((m) => m.due > 0)
      .reduce((s, m) => s + m.due, 0);

    // Auto-deposit excess food purchases into next cycle's wallet
    await withTransaction(async (session) => {
      for (const m of dues.members) {
        const excessFood = Math.max(0, Math.round(m.foodPurchases - m.mealCost));
        if (excessFood > 0) {
          const [autoDeposit] = await Deposit.create(
            [
              {
                homeId,
                createdBy: actorUserId,
                membershipId: new Types.ObjectId(m.membershipId),
                amount: excessFood,
                depositType: DepositType.Other,
                date: `${next}-01`,
                cycle: next,
              },
            ],
            { session },
          );

          const { txn } = await walletService.credit(session, {
            homeId,
            membershipId: new Types.ObjectId(m.membershipId),
            amount: excessFood,
            source: WalletTxnSource.Deposit,
            createdBy: actorUserId,
            refModel: 'Deposit',
            refId: autoDeposit._id,
            note: `Food purchase excess carryover from cycle ${cycle}`,
          });

          autoDeposit.walletTxnId = txn._id;
          await autoDeposit.save({ session });
        }
      }
    });

    // Member snapshot: carry over positive unpaid dues only (since food excess is converted to next-cycle wallet deposit)
    const memberSnapshot = dues.members.map((m) => ({
      membershipId: m.membershipId,
      userName: m.userName,
      due: m.due > 0 ? m.due : 0,
      carriedOver: m.carriedOverBalance,
    }));

    // Upsert the MonthCycle record (idempotent)
    const closedCycle = await MonthCycle.findOneAndUpdate(
      { homeId, cycle },
      {
        $set: {
          status: CycleStatus.Closed,
          mealRate: dues.mealRate,
          totals: {
            meals: dues.homeTotalMeals,
            foodPurchases: dues.totalFoodPurchases,
            expenses: dues.totalFixedExpenses,
            fixedExpenses: dues.totalFixedExpenses,
            deposits: dues.totalDeposits,
            totalCharge,
            totalCredit,
            totalDue: totalOutstanding,
          },
          memberSnapshot,
          closedBy: actorUserId,
          closedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );

    // Advance home.currentCycle to next month
    await Home.updateOne({ _id: homeId }, { currentCycle: next });

    // Audit log — non-blocking
    auditLogService
      .log({
        homeId,
        actorUserId,
        actorName,
        action: 'CLOSE_MONTH',
        targetModel: 'MonthCycle',
        targetId: closedCycle._id.toString(),
        after: { cycle, status: CycleStatus.Closed, nextCycle: next, totalOutstanding },
      })
      .catch(() => {/* swallow */});

    // Notify all active members — non-blocking
    Membership.find({ homeId, status: MembershipStatus.Active })
      .populate<{ userId: { _id: Types.ObjectId } }>('userId', '_id')
      .lean()
      .then((memberships) => {
        const userIds = memberships.map((m) => m.userId._id);
        return notificationService.createForHomeMembers(
          userIds,
          homeId,
          NotificationType.MonthClosed,
          `Month ${cycle} has been closed. Food purchase excess carryovers have been deposited into next month's wallet. Next cycle: ${next}.`,
          { cycle, next },
        );
      })
      .catch(() => {/* swallow */});

    return {
      cycle,
      status: CycleStatus.Closed,
      nextCycle: next,
      mealRate: dues.mealRate,
      totalOutstanding,
      memberCount: dues.members.length,
    };
  },

  async history(homeId: Types.ObjectId) {
    const cycles = await MonthCycle.find({ homeId, status: CycleStatus.Closed })
      .sort({ cycle: -1 })
      .limit(24)
      .lean();

    return {
      cycles: cycles.map((c) => ({
        id: c._id.toString(),
        cycle: c.cycle,
        status: c.status,
        mealRate: c.mealRate,
        totals: c.totals,
        memberSnapshot: c.memberSnapshot,
        closedAt: c.closedAt?.toISOString() ?? null,
      })),
    };
  },

  async currentStatus(homeId: Types.ObjectId, cycle: string) {
    const record = await MonthCycle.findOne({ homeId, cycle }).lean();
    return {
      cycle,
      status: record?.status ?? CycleStatus.Open,
      closedAt: record?.closedAt?.toISOString() ?? null,
    };
  },

  async assertCycleIsOpen(homeId: Types.ObjectId, cycle: string): Promise<void> {
    const status = await this.currentStatus(homeId, cycle);
    if (status.status === CycleStatus.Closed) {
      throw ApiError.badRequest(`Cannot modify records for closed cycle: ${cycle}`);
    }
  },

  async isCycleOpen(homeId: Types.ObjectId, cycle: string): Promise<boolean> {
    const status = await this.currentStatus(homeId, cycle);
    return status.status !== CycleStatus.Closed;
  },
};
