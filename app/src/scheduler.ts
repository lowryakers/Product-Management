import { prisma } from './db';
import { env } from './env';
import { sendPush } from './lib/push';

/**
 * In-process scheduler. Ticks once a minute and fires jobs when the local hour
 * matches, guarding against duplicates via NotificationLog. Deliberately not a
 * cron dependency — one small instance does not need one, and this keeps the
 * dependency list short.
 *
 * The same jobs are reachable over HTTP (see registerCronRoutes) if you ever
 * move to Railway's cron service.
 */

function localParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: env.tz,
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    hour: Number(parts.hour === '24' ? '0' : parts.hour),
    weekday: parts.weekday as string,
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

async function alreadyRan(kind: string, dateKey: string): Promise<boolean> {
  const existing = await prisma.notificationLog.findFirst({
    where: { kind, payload: { path: ['dateKey'], equals: dateKey } },
  });
  return Boolean(existing);
}

async function markRan(kind: string, dateKey: string, extra: Record<string, unknown> = {}) {
  await prisma.notificationLog.create({
    data: { kind, payload: { dateKey, ...extra } as any, succeeded: true },
  });
}

/** Nudge only if there is something to triage. A nudge about nothing trains you to ignore it. */
export async function runTriageNudge(force = false): Promise<{ ran: boolean; count: number }> {
  const { date } = localParts();
  if (!force && (await alreadyRan('triage_nudge', date))) return { ran: false, count: 0 };

  const count = await prisma.inboxItem.count({ where: { status: 'NEW' } });
  if (count === 0) {
    await markRan('triage_nudge', date, { skipped: 'empty' });
    return { ran: false, count: 0 };
  }

  const users = await prisma.user.findMany({ select: { id: true } });
  await sendPush(
    users.map((u) => u.id),
    {
      title: `${count} to triage`,
      body:
        count === 1
          ? 'One item is waiting. Ten seconds to clear it.'
          : `${count} items are waiting. Ten minutes clears the queue.`,
      url: '/inbox?status=NEW',
      tag: 'triage',
    },
    'triage_nudge',
  );
  await markRan('triage_nudge', date, { count });
  return { ran: true, count };
}

export async function runMondayDigest(force = false): Promise<{ ran: boolean }> {
  const { date, weekday } = localParts();
  if (!force && weekday !== 'Mon') return { ran: false };
  if (!force && (await alreadyRan('monday_digest', date))) return { ran: false };

  const [open, overdue, inProduction, artworkWaiting] = await Promise.all([
    prisma.inboxItem.count({ where: { status: { notIn: ['DONE'] } } }),
    prisma.inboxItem.count({
      where: { status: { notIn: ['DONE'] }, dueDate: { lt: new Date() } },
    }),
    prisma.pOLine.count({
      where: { excluded: false, lineStatus: { in: ['IN_PRODUCTION', 'PLATES_MADE', 'SHIPPED'] } },
    }),
    prisma.artworkVersion.count({
      where: { stage: { in: ['INTERNAL_REVIEW', 'VENDOR_PROOF'] } },
    }),
  ]);

  const users = await prisma.user.findMany({ select: { id: true } });
  await sendPush(
    users.map((u) => u.id),
    {
      title: 'Monday · ProDough',
      body: `${open} open${overdue ? `, ${overdue} overdue` : ''} · ${inProduction} PO lines in production · ${artworkWaiting} proofs on you`,
      url: '/',
      tag: 'digest',
    },
    'monday_digest',
  );
  await markRan('monday_digest', date, { open, overdue, inProduction, artworkWaiting });
  return { ran: true };
}

/** Promised dates that have passed with nothing received. */
export async function runLateVendorCheck(force = false): Promise<{ ran: boolean; late: number }> {
  const { date } = localParts();
  if (!force && (await alreadyRan('late_vendor', date))) return { ran: false, late: 0 };

  const late = await prisma.pOLine.count({
    where: {
      excluded: false,
      promisedDate: { lt: new Date() },
      actualReceiptDate: null,
      lineStatus: { notIn: ['RECEIVED', 'QC_PASSED', 'STOCKED', 'CANCELLED'] },
    },
  });
  if (late === 0) {
    await markRan('late_vendor', date, { skipped: 'none' });
    return { ran: false, late: 0 };
  }

  const users = await prisma.user.findMany({ select: { id: true } });
  await sendPush(
    users.map((u) => u.id),
    {
      title: `${late} PO line${late === 1 ? '' : 's'} past promise`,
      body: 'Promised date has passed with nothing received.',
      url: '/pos',
      tag: 'late',
    },
    'late_vendor',
  );
  await markRan('late_vendor', date, { late });
  return { ran: true, late };
}

let timer: NodeJS.Timeout | null = null;

export function startScheduler() {
  if (timer) return;
  const tick = async () => {
    try {
      const { hour } = localParts();
      if (hour === env.nudgeHour) {
        await runTriageNudge();
        await runMondayDigest();
        await runLateVendorCheck();
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('scheduler tick failed', err);
    }
  };
  timer = setInterval(tick, 60_000);
  timer.unref?.();
  void tick();
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
