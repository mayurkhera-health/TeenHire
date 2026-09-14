import { payHeadline, payTranslation } from '@/lib/copy';
import type { Compensation, HoursBucket, Timing } from '@/lib/types';

/* Pay never appears bare on white. It sits on its own warm ground, with a
   plain-English translation under the rate — "$20/hr" is a number, "about
   $160 a weekend" is something a student can picture. */

export function MoneyBlock({
  compensation,
  timing,
  hours,
}: {
  compensation: Compensation;
  timing: Timing[];
  hours?: HoursBucket;
}) {
  if (compensation.kind === 'commitment') return null;

  const translation = payTranslation(compensation, timing, hours);

  return (
    <div className="money">
      <span className="t-pay">{payHeadline(compensation)}</span>
      {translation ? <span className="money-note">{translation}</span> : null}
    </div>
  );
}
