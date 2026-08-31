import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { dashboardApi, monthEndApi, mealApi } from '@/api/financeApi';
import { currentCycle, taka, todayKey } from '@/lib/format';
import type { DashboardSummary, DashboardExpenseInstance, ExpenseCategory, MonthCycleDto, CycleStatusDto } from '@/types/finance';
import { useAppSelector } from '@/app/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Sparkles, CalendarDays, Wallet, TrendingUp, CheckCircle, Circle, AlertCircle, CheckCheck, RefreshCcw, RefreshCcwDot,  RefreshCwOffIcon} from 'lucide-react';
import { toast } from 'sonner';
import { homeApi } from '@/api/homeApi';

const moneyFormatter = (value: string | number | readonly (string | number)[] | undefined) => {
  const numericValue = Array.isArray(value) ? Number(value[0] ?? 0) : Number(value ?? 0);
  return taka(Number.isFinite(numericValue) ? numericValue : 0);
};

const PIE_COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#64748b'];

const TYPE_ORDER: Record<ExpenseCategory, number> = {
  independently_counted: 0,
  equally_shared: 1,
  individual: 2,
};
const TYPE_LABEL: Record<ExpenseCategory, string> = {
  independently_counted: 'Rent',
  equally_shared: 'Shared',
  individual: 'Individual',
};


export default function DashboardPage() {
  const isAdmin = useAppSelector((s) => s.home.membership?.role === 'admin');
  const defaultCycle = useAppSelector((s) => s.home.home?.currentCycle);
  const [cycle, setCycle] = useState(defaultCycle || currentCycle());

  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cycleStatus, setCycleStatus] = useState<CycleStatusDto | null>(null);
  const [history, setHistory] = useState<MonthCycleDto[]>([]);
  const [closing, setClosing] = useState(false);
  const [closeMsg, setCloseMsg] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [updatingPayment, setUpdatingPayment] = useState<string | null>(null);
  const [descoStatus, setDescoStatus] = useState<{
    balance?: { currentBalance?: number; totalMonthlyUsage?: number };
    history?: {
      history?: unknown[];
      lastRecharge?: number;
      lastRechargeDate:string;
      currentMonthTotalRecharge?: number;
    };
  } | null>({});
  const [loadingDesco, setLoadingDesco] = useState(false);
  const [descoAccountNo, setDescoAccountNo] = useState<String | null>('')

  function GetDescoCard(t: 'live' | 'last' | 'tRecharged' | 'tUsed') {
      const cardSchema = {
        live: {
          title: 'Live Balance',
          lowClassName: 'text-red-700 dark:text-red-400 bg-red-500/15 dark:bg-red-950/40 border-red-300 dark:border-red-900 flex-1',
          highClassName: 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-900 flex-1',
        },
        last: {
          title: 'Last Recharge',
          className: 'text-amber-700 dark:text-yellow-400 bg-amber-500/15 dark:bg-yellow-950/40 border-amber-300 dark:border-amber-900 flex-1',
        },
        tRecharged: {
          title: 'Total Recharged',
          className: 'text-blue-700 dark:text-blue-400 bg-blue-500/15 dark:bg-blue-950/40 border-blue-300 dark:border-blue-900 flex-1',
        },
        tUsed: {
          title: 'Total Used',
          className: 'text-purple-700 dark:text-purple-400 bg-purple-500/15 dark:bg-purple-950/40 border-purple-300 dark:border-purple-900 flex-1',
        },
      };
      const isLowBalance = Number(descoStatus?.balance?.currentBalance ?? 0) <= 100;
      const className = t === 'live'
        ? (isLowBalance ? cardSchema.live.lowClassName : cardSchema.live.highClassName)
        : cardSchema[t].className;
      const classString = `min-w-0 text-center rounded-lg border text-[10px] font-semibold tracking-wide py-1 px-1.5 ${className}`;
      const amount = t === "live" ? descoStatus?.balance?.currentBalance ?? 0 : t === "last" ? descoStatus?.history?.lastRecharge ?? 0 : t === "tRecharged" ? descoStatus?.history?.currentMonthTotalRecharge ?? 0 : descoStatus?.balance?.totalMonthlyUsage ?? 0;
      return (
        <div className={classString}>
            <p className="opacity-90">{cardSchema[t].title}</p>
            <div className="flex items-center justify-center text-center gap-0.5 mt-0.5">
                <span className='text-[13px] font-bold'>৳</span>
                <span className='text-[11px] font-bold'>{taka(amount)}</span>
            {t === 'last' && <span
                className={'relative text-[8px] border border-current rounded-full px-1.5 py-0.2 ml-1 bg-amber-500/10 dark:bg-yellow-900/40 font-semibold'}>{new Date(descoStatus?.history?.lastRechargeDate ?? '').toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            })}</span>}
            </div>
        </div>
      )
  }
  function getCurrentMonthRangeString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); 
    const firstDay = new Date(year, month, 1);
    const dateFrom = firstDay.toISOString().split('T')[0];
    const lastDay = new Date(year, month + 1, 0);
    const dateTo = lastDay.toISOString().split('T')[0];
    console.log(dateFrom, dateTo);
    return `dateFrom=${dateFrom}&dateTo=${dateTo}`;
  }

  const getDescoAccountNo = async () => {
    if (descoAccountNo) return descoAccountNo;
    const res = await homeApi.myHome();
    const acc = res.data.data.home?.descoAccountNo ?? null
    setDescoAccountNo(acc)
    return acc;

  }

  const loadDescoStatus = useCallback(async () => {
    try {
      setLoadingDesco(true);
      // setDescoStatus({})
      const accNo = await getDescoAccountNo()
      console.log('Loading DESCO status...', accNo);
      if(!accNo) {
        console.error('DESCO account number is not set.First, Set it in Household Settings.');
        return;
      }

      const historyUrl = `https://prepaid.desco.org.bd/api/tkdes/customer/getRechargeHistory?accountNo=${accNo}&${getCurrentMonthRangeString()}`;
      const balanceUrl = `https://prepaid.desco.org.bd/api/tkdes/customer/getBalance?accountNo=${accNo}`;
      const historyRes = await fetch(historyUrl, { method: 'GET' });
      const balanceRes = await fetch(balanceUrl, { method: 'GET' });
      
      const historyData = await historyRes.json();
      const balanceData = await balanceRes.json();
      console.log(historyData, balanceData);
      let currentMonthTotalRecharge;
      let history;
      let balance;
      (historyData.code===200)?(
        currentMonthTotalRecharge = historyData?.data?.reduce((sum: number, item: any) => sum + item.totalAmount, 0),
        history = {
          history: historyData?.data,
          currentMonthTotalRecharge: currentMonthTotalRecharge?? null,
          lastRecharge: historyData?.data[0]?.totalAmount ?? 0,
          lastRechargeDate : historyData?.data[0]?.rechargeDate ?? ""
        }
      ):(history=undefined);

      (balanceData.code===200)?(
        balance = {
            currentBalance: balanceData.data?.balance,
            totalMonthlyUsage: balanceData.data?.currentMonthConsumption,
          }
      ):(balance=undefined);
      setDescoStatus({ history, balance });
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDesco(false);
    }
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [res, statusRes] = await Promise.all([
        dashboardApi.summary(cycle),
        monthEndApi.status(cycle),
      ]);
      setData(res.data.data);
      setCycleStatus(statusRes.data.data);
    } catch (e) {
      const x = e as { response?: { data?: { message?: string } } };
      setError(x.response?.data?.message ?? 'Failed to load');
    }
  }, [cycle]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await monthEndApi.history();
      setHistory(res.data.data.cycles);
    } catch {
      // ignore
    }
  }, []);
  useEffect(()=>{loadDescoStatus()}, [descoAccountNo])

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (showHistory) loadHistory(); }, [showHistory, loadHistory]);

  const closeMonth = async () => {
    if (!window.confirm(`Close cycle ${data?.cycle ?? currentCycle()}? This cannot be undone.`)) return;
    setClosing(true);
    setCloseMsg(null);
    try {
      const res = await monthEndApi.close(data?.cycle);
      setCloseMsg(`✅ Month ${res.data.data.cycle} closed. Next cycle: ${res.data.data.nextCycle}.`);
      await load();
    } catch (e) {
      const x = e as { response?: { data?: { message?: string } } };
      setCloseMsg(`❌ ${x.response?.data?.message ?? 'Failed to close month'}`);
    } finally {
      setClosing(false);
    }
  };

  const handleCloseMealCount = async () => {
    if (!window.confirm(`Close meals for today? No one will be able to edit meals for today after this.`)) return;
    try {
      await mealApi.closeDay(todayKey());
      alert('Meals for today closed successfully.');
    } catch (e) {
      const x = e as { response?: { data?: { message?: string } } };
      const msg = x.response?.data?.message ?? 'Failed to close day';
      if (msg.startsWith('PendingGuestMeals:')) {
        const count = msg.split(':')[1];
        alert(`Today's guest meal count is ${count} (pending). Please resolve them first!`);
      } else {
        alert(msg);
      }
    }
  };

  const [rejectionAlert, setRejectionAlert] = useState<{
    title: string;
    message: string;
    details?: string;
  } | null>(null);

  const handleTogglePayment = async (exp: DashboardExpenseInstance) => {
    if (!isAdmin || isClosed) return;
    const nextPaid = exp.status !== 'paid';

    setUpdatingPayment(exp.expenseId);
    try {
      const res = await dashboardApi.markPaid({ expenseId: exp.expenseId, isPaid: nextPaid });
      const r = res.data.data;
      if (nextPaid && r.rejected) {
        toast.error(`Payment rejected: Insufficient wallet funds for ${exp.purpose}`);
        setRejectionAlert({
          title: 'Payment Rejected — Insufficient Wallet Funds',
          message: `Expense "${exp.purpose}" requires ${taka(exp.amount)}.`,
          details: typeof r.balance === 'number'
            ? `Member's available wallet balance is ${taka(r.balance)}. Please record a deposit first.`
            : r.reason || 'Insufficient funds.',
        });
      } else if (nextPaid) {
        toast.success(`Paid ${taka(exp.amount)} for "${exp.purpose}" from wallet!`);
      } else {
        toast.info(`Payment reversed for "${exp.purpose}". Wallet refunded.`);
      }
      await load();
    } catch (e) {
      const x = e as { response?: { data?: { message?: string } } };
      const msg = x.response?.data?.message || 'Failed to update payment status';
      toast.error(msg);
      setError(msg);
    } finally {
      setUpdatingPayment(null);
    }
  };

  const handleMarkAllPaid = async (type: ExpenseCategory, purpose: string) => {
    if (!isAdmin || isClosed) return;
    const pending = (data?.members ?? []).flatMap((m) =>
      m.expenses.filter((e) => e.type === type && e.purpose === purpose && e.status !== 'paid'),
    );
    if (pending.length === 0) {
      toast.info(`All "${purpose}" expenses are already paid.`);
      return;
    }
    if (!window.confirm(`Mark all ${pending.length} unpaid "${purpose}" expense(s) as paid across all users? Each is settled from the member's wallet; insufficient funds are rejected.`)) return;

    setUpdatingPayment(`all-${type}-${purpose}`);
    let rejected = 0;
    try {
      for (const exp of pending) {
        try {
          const res = await dashboardApi.markPaid({ expenseId: exp.expenseId, isPaid: true });
          if (res.data.data.rejected) rejected += 1;
        } catch {
          rejected += 1;
        }
      }
      await load();
      if (rejected > 0) {
        setRejectionAlert({
          title: 'Batch Payment Completed with Rejections',
          message: `${rejected} out of ${pending.length} "${purpose}" payment(s) were rejected due to insufficient member wallet funds.`,
          details: 'Please check individual member wallet balances and record deposits as needed.',
        });
      } else {
        toast.success(`Successfully paid all ${pending.length} "${purpose}" expense(s)!`);
      }
    } finally {
      setUpdatingPayment(null);
    }
  };
  const cards = [
    { 
      label: 'Total Meals', 
      value: data ? `${data.meals.homeTotal}` : '—', 
      sub: data ? `${data.meals.today} today` : '', 
      icon: CalendarDays, 
      color: 'text-blue-500',
      details: data?.members?.map(m => ({ label: m.userName, value: m.mealCount }))
    },
    { 
      label: 'Total Expenses', 
      value: data ? taka(data.finance.expenses) : '৳ —', 
      sub: data ? `${taka(data.finance.fixedExpenses)} fixed` : '', 
      icon: Wallet, 
      color: 'text-rose-500',
      details: data ? [
        ...(data.expenseByType || []).map(e => ({ label: e.type.replace(/_/g, ' ').replace('independently counted', 'Home Rent'), value: taka(e.amount) })),
        { label: 'Food Purchases', value: taka(data.finance.foodPurchases), separator: true }
      ] : []
    },
    { 
      label: 'Wallet Balances', 
      value: data ? taka(data.finance.walletBalanceTotal) : '৳ —', 
      sub: data ? `${taka(data.finance.deposits)} deposited` : '', 
      icon: TrendingUp, 
      color: 'text-emerald-500',
      details: data?.members?.map(m => ({ label: m.userName, value: taka(m.walletBalance) }))
    },
    {
      label: 'Expenses Paid',
      value: data ? `${taka(data.expenses.paid)}` : '৳ —',
      sub: data ? `${taka(data.expenses.unpaid)} unpaid` : '',
      icon: AlertCircle,
      color: 'text-yellow-500',
      details: data ? [
        { label: 'Paid', value: taka(data.expenses.paid) },
        { label: 'Unpaid', value: taka(data.expenses.unpaid) },
      ] : []
    },
  ];

  const memberBars = (data?.members ?? []).map((m) => ({ name: m.userName, due: m.due }));
  const isClosed = cycleStatus?.status === 'closed';

  // Build unique expense rows (one row per category type + purpose) across all members;
  // each cell aggregates a member's own expense items for that row.
  const members = data?.members ?? [];
  const makeRowKey = (type: ExpenseCategory, purpose: string) => `${type}||${purpose}`;

  const rowMeta = new Map<string, { type: ExpenseCategory; purpose: string }>();
  for (const m of members) {
    for (const e of m.expenses) {
      const key = makeRowKey(e.type, e.purpose);
      if (!rowMeta.has(key)) rowMeta.set(key, { type: e.type, purpose: e.purpose });
    }
  }
  const expenseRows = Array.from(rowMeta.entries())
    .map(([key, meta]) => ({ key, ...meta }))
    .sort((a, b) =>
      (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9) || a.purpose.localeCompare(b.purpose),
    );
  const cellItemsFor = (m: (typeof members)[number], key: string) =>
    m.expenses.filter((e) => makeRowKey(e.type, e.purpose) === key);

  return (
    <div className="relative min-w-0 space-y-5 pb-8 sm:space-y-6 sm:pb-12 lg:space-y-8">
      {/* Background ambient light */}
      <div className="absolute top-0 left-0 w-full h-[240px] sm:h-[300px] bg-gradient-to-b from-primary/10 via-primary/5 to-transparent rounded-full blur-[120px] -z-10 pointer-events-none" />

      {error && <p className="rounded-xl bg-destructive/10 p-4 text-sm font-medium text-destructive border border-destructive/20">{error}</p>}

      {/* Header section */}
      <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-4 sm:gap-5 rounded-2xl border border-border/50 bg-card/60 shadow-sm backdrop-blur-xl px-4 sm:px-6 py-3">
        <div className="flex items-center gap-3 shrink-0">
          <div className="p-2.5 bg-primary/10 rounded-xl">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="flex flex-col items-start justify-center">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                Overview
              </h2>
              {isClosed ? (
                <Badge variant="secondary" className="bg-muted/50 text-muted-foreground border-0 text-xs px-2 py-0.5">Closed</Badge>
              ) : (
                <Badge variant="default" className="bg-primary/20 text-primary hover:bg-primary/30 border-0 text-xs px-2 py-0.5">Active</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cycle:</span>
              <input 
                type="month" 
                value={cycle}
                onChange={(e) => setCycle(e.target.value)}
                className="bg-primary/10 p-1 rounded-md text-xs font-medium border border-border/50 focus:outline-none focus:border-primary text-primary cursor-pointer px-2 shadow-xs"
              />
            </div>
          </div>
        </div>

        <div className="min-w-0 w-fit shrink-0 rounded-xl border border-border/50 bg-background/35 p-2">
          <div className="flex items-center justify-center gap-3">
            <p className="min-w-0 text-xs font-semibold uppercase tracking-wider text-primary/80">Electricity Live Status</p>
            <p className="cursor-pointer"> {descoStatus ? (loadingDesco ? <RefreshCcw /> : <RefreshCcwDot onClick={loadDescoStatus}/> ) : <RefreshCwOffIcon />}</p>
          </div>

          {(descoStatus?.balance || descoStatus?.history) ? (
            <div className="grid grid-cols-2 gap-1">
              {GetDescoCard('live')}
              {GetDescoCard('last')}
              {GetDescoCard('tRecharged')}
              {GetDescoCard('tUsed')}
            </div>
          ) : (
            loadingDesco ? <div className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-xs font-semibold text-destructive">Loading Stats.</div>
            : <div className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-xs font-semibold text-destructive">Invalid account number.</div>
          )}
        </div>

        {data && (
          <div className="shrink-0 rounded-xl bg-muted/40 border border-border/30 px-3.5 py-1.5 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Meal Rate</p>
            <p className="text-base font-bold text-primary">{taka(data.finance.mealRate ?? 0)}</p>
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
          {isAdmin && !isClosed && (
            <Button variant="destructive" size="sm" onClick={closeMonth} disabled={closing} className="rounded-xl shadow-md shadow-destructive/20 text-xs h-8.5 px-3">
              {closing ? 'Closing...' : 'Close Month'}
            </Button>
          )}
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={handleCloseMealCount} className="rounded-xl border-primary text-primary transition-colors hover:bg-primary/10 text-xs h-8.5 px-3">
              Close Today's Meal
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowHistory((h) => !h)} className="rounded-xl bg-background/50 backdrop-blur-sm text-xs h-8.5 px-3">
            {showHistory ? 'Hide History' : 'History'}
          </Button>
        </div>
      </div>

      {closeMsg && (
        <p className={`rounded-xl p-4 text-sm font-medium border shadow-sm ${closeMsg.startsWith('✅') ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-destructive/10 text-destructive border-destructive/20'}`}>
          {closeMsg}
        </p>
      )}

      {rejectionAlert && (
        <div className="flex flex-col gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-800 shadow-md dark:text-amber-300 sm:flex-row sm:items-start sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-base">{rejectionAlert.title}</h4>
              <p className="text-sm font-medium mt-1">{rejectionAlert.message}</p>
              {rejectionAlert.details && <p className="text-xs text-muted-foreground mt-1">{rejectionAlert.details}</p>}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setRejectionAlert(null)} className="self-end sm:self-auto">
            Dismiss
          </Button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6">
        {cards.map((c, i) => (
          <Card key={i} className="min-w-0 border-0 bg-background/60 shadow-lg ring-1 ring-border/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
            <CardContent className="p-4 sm:p-5 lg:p-6">
              <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
                <p className="min-w-0 text-sm font-medium text-muted-foreground">{c.label}</p>
                <div className={`p-2 rounded-lg bg-background/80 shadow-sm ${c.color}`}>
                  <c.icon className="w-4 h-4" />
                </div>  
              </div>
              <h3 className="break-words text-2xl font-extrabold tracking-tight sm:text-3xl">{c.value}</h3>
              {c.sub && <p className="text-xs text-muted-foreground mt-2 font-medium">{c.sub}</p>}
              
              {c.details && c.details.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border/50 space-y-1.5">
                  {c.details.map((detail, idx) => (
                    <div key={idx} className={`flex items-start justify-between gap-3 text-sm ${'separator' in detail && detail.separator ? 'mt-3 pt-3 border-t border-border/50' : ''}`}>
                      <span className="min-w-0 break-words text-muted-foreground">{detail.label.toLocaleUpperCase()}</span>
                      <span className={`shrink-0 text-right font-medium ${c.color}`}>{detail.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Payment Status Section */}
      <Card className="min-w-0 border-0 bg-background/60 shadow-lg ring-1 ring-border/50 overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-gradient-to-r from-muted/30 to-transparent p-4 pb-4 sm:p-6 sm:pb-4">
          <CardTitle className="text-lg sm:text-xl">Expense Payments</CardTitle>
          <CardDescription>
            {isAdmin
              ? 'Mark each expense paid to settle it from the member\u2019s wallet. Insufficient funds are rejected. Meals are display-only.'
              : 'Your assigned expenses and their payment status. Meals are shown for reference only.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {members.length > 0 ? (
            <Table className="min-w-[44rem]">
              <TableHeader className="bg-muted/20">
                <TableRow>
                  <TableHead className="pl-6 py-4 text-foreground font-semibold min-w-[180px]">Expense</TableHead>
                  {members.map(m => (
                    <TableHead key={m.membershipId} className="text-center py-4 text-foreground font-semibold min-w-[120px]">
                      <div className="flex flex-col items-center gap-1 justify-center">
                        <UserAvatar name={m.userName} size="xs" />
                        <span>{m.userName}</span>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenseRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={members.length + 1} className="py-8 text-center text-muted-foreground">
                      No expenses created for this cycle yet.
                    </TableCell>
                  </TableRow>
                )}

                {expenseRows.map(row => (
                  <TableRow key={row.key} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="pl-6 py-4 font-medium">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <span>{row.purpose}</span>
                          <span className="text-xs text-muted-foreground">{TYPE_LABEL[row.type] ?? row.type}</span>
                        </div>
                        {isAdmin && !isClosed && (
                          <button onClick={() => handleMarkAllPaid(row.type, row.purpose)} className="text-muted-foreground hover:text-emerald-500 transition-colors" title="Mark all unpaid of this type as paid">
                            <CheckCheck className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                    {members.map((m) => {
                      const items = cellItemsFor(m, row.key);
                      if (items.length === 0) {
                        return (
                          <TableCell key={m.membershipId} className="py-4 text-center">
                            <span className="text-muted-foreground/40 text-xs">—</span>
                          </TableCell>
                        );
                      }
                      const totalAmount = items.reduce((s, e) => s + e.amount, 0);
                      const paidAmount = items.filter((e) => e.status === 'paid').reduce((s, e) => s + e.amount, 0);
                      const unpaidAmount = totalAmount - paidAmount;
                      const isAllPaid = items.every((e) => e.status === 'paid');
                      const firstUnpaid = items.find((e) => e.status !== 'paid');
                      const targetExp = firstUnpaid || items[0];
                      const isBusy = updatingPayment === targetExp.expenseId || updatingPayment === `all-${row.type}-${row.purpose}`;

                      return (
                        <TableCell
                          key={m.membershipId}
                          title={`${m.userName} — ${row.purpose}`}
                          className={`py-4 text-center transition-colors ${isAllPaid ? 'bg-emerald-500/10' : 'bg-destructive/10'}`}
                        >
                          <div className="flex flex-col items-center gap-1">
                            {isAllPaid ? (
                              <span className="text-sm font-semibold text-emerald-600">{taka(totalAmount)}</span>
                            ) : paidAmount > 0 ? (
                              <div className="flex flex-col items-center">
                                <span className="text-sm font-bold text-amber-600">{taka(unpaidAmount)}</span>
                                <span className="text-[10px] text-muted-foreground">of {taka(totalAmount)} total</span>
                              </div>
                            ) : (
                              <span className="text-sm font-semibold">{taka(unpaidAmount)}</span>
                            )}
                            <button
                              disabled={!isAdmin || isClosed || updatingPayment !== null}
                              onClick={() => handleTogglePayment(targetExp)}
                              className={`flex items-center justify-center p-1 rounded-full transition-colors ${
                                !isAdmin || isClosed ? 'cursor-default opacity-70' : 'cursor-pointer hover:bg-muted'
                              }`}
                              title={isAllPaid ? 'Paid — click to reverse' : `Unpaid (${taka(unpaidAmount)}) — click to pay from wallet`}
                            >
                              {isBusy ? (
                                <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                              ) : isAllPaid ? (
                                <CheckCircle className="w-5 h-5 text-emerald-500" />
                              ) : (
                                <Circle className="w-5 h-5 text-muted-foreground/40" />
                              )}
                            </button>
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}

                {/* Meals — DISPLAY ONLY (settled outside the wallet) */}
                <TableRow className="bg-primary/5">
                  <TableCell className="pl-6 py-4 font-medium">
                    <div className="flex flex-col">
                      <span>Meals</span>
                      <span className="text-xs text-muted-foreground">Display only</span>
                    </div>
                  </TableCell>
                  {members.map(m => (
                    <TableCell key={m.membershipId} title={m.userName} className="py-4 text-center">
                      <span className="text-sm font-medium text-primary/80">{taka(m.mealCost)}</span>
                    </TableCell>
                  ))}
                </TableRow>

                {/* Wallet balance row */}
                <TableRow className="bg-muted/20 border-t-2 border-border/50">
                  <TableCell className="pl-6 py-4 font-bold text-foreground">Wallet Balance</TableCell>
                  {members.map(m => (
                    <TableCell key={m.membershipId} title={m.userName} className="text-center py-4">
                      <span className={`font-bold ${m.walletBalance > 0 ? 'text-emerald-500' : m.walletBalance < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {taka(m.walletBalance)}
                      </span>
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          ) : (
             <div className="p-8 text-center text-muted-foreground">No members found.</div>
          )}
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2 lg:gap-6">
        <Card className="min-w-0 border-0 bg-background/60 shadow-lg ring-1 ring-border/50">
          <CardHeader>
            <CardTitle>Expense Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {data && data.expenseByType.length > 0 ? (
              <div className="h-[220px] sm:h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.expenseByType}
                      dataKey="amount"
                      nameKey="type"
                      cx="50%"
                      cy="50%"
                      innerRadius="45%"
                      outerRadius="75%"
                      paddingAngle={5}
                      label={false}
                    >
                      {data.expenseByType.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value) => moneyFormatter(value)} 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[220px] sm:h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                No expenses recorded.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 border-0 bg-background/60 shadow-lg ring-1 ring-border/50">
          <CardHeader>
            <CardTitle>Deposit Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {data && data.depositTrend.length > 0 ? (
              <div className="h-[220px] sm:h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.depositTrend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} 
                      stroke="hsl(var(--border))"
                      tickFormatter={(v) => new Date(v).getDate().toString()}
                    />
                    <YAxis 
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} 
                      stroke="hsl(var(--border))" 
                      width={40}
                    />
                    <Tooltip 
                      formatter={(value) => moneyFormatter(value)}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="amount" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={3} 
                      dot={{ r: 4, strokeWidth: 2, fill: "hsl(var(--background))" }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[220px] sm:h-[280px] flex items-center justify-center text-sm text-muted-foreground">
                No deposits recorded.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Member balances bar chart */}
      <Card className="min-w-0 border-0 bg-background/60 shadow-lg ring-1 ring-border/50">
        <CardHeader>
          <CardTitle>Member Balances</CardTitle>
        </CardHeader>
        <CardContent>
          {memberBars.length > 0 ? (
            <div className="h-[240px] sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={memberBars} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" height={62} angle={-28} textAnchor="end" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" />
                  <Tooltip 
                    formatter={(value) => moneyFormatter(value)}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="due" radius={[6, 6, 0, 0]} maxBarSize={50}>
                    {memberBars.map((m, i) => (
                      <Cell key={i} fill={m.due > 0 ? 'hsl(var(--destructive))' : 'hsl(var(--primary))'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[240px] sm:h-[300px] flex items-center justify-center text-sm text-muted-foreground">
              No member data available.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Month-end history */}
      {showHistory && (
        <Card className="border-0 bg-background/60 backdrop-blur-xl shadow-lg ring-1 ring-border/50 overflow-hidden animate-in fade-in slide-in-from-top-4">
          <CardHeader className="bg-gradient-to-r from-muted/30 to-transparent border-b border-border/50">
            <CardTitle>Closed Cycles</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {history.length > 0 ? (
              <Table className="min-w-[52rem]">
                <TableHeader className="bg-muted/20">
                  <TableRow>
                    <TableHead className="pl-6">Cycle</TableHead>
                    <TableHead className="text-right">Meal rate</TableHead>
                    <TableHead className="text-right">Meals</TableHead>
                    <TableHead className="text-right">Food</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Deposits</TableHead>
                    <TableHead className="text-right font-semibold">Total Due</TableHead>
                    <TableHead className="pr-6">Closed at</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((c) => (
                    <TableRow key={c.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium pl-6">{c.cycle}</TableCell>
                      <TableCell className="text-right">{taka(c.mealRate)}</TableCell>
                      <TableCell className="text-right">{c.totals.meals}</TableCell>
                      <TableCell className="text-right">{taka(c.totals.foodPurchases)}</TableCell>
                      <TableCell className="text-right">{taka(c.totals.expenses)}</TableCell>
                      <TableCell className="text-right">{taka(c.totals.deposits)}</TableCell>
                      <TableCell className="text-right font-bold text-destructive">
                        {taka(c.totals.totalDue)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs pr-6">
                        {c.closedAt
                          ? new Date(c.closedAt).toLocaleDateString('en-BD')
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-8 text-center text-muted-foreground">No closed cycles yet.</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
