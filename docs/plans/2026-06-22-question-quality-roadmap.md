# Question Quality Roadmap

Goal: keep question quality improving while giving players and Teddy a practical way to catch issues before they reach the daily 5.

## Completed First

1. Player report button
   - Add a visible report control on daily and sport-specific quiz questions.
   - Store structured reports with question, reason, optional note, context, reporter user when available, status, and timestamps.

2. Player feedback workflow
   - Added a site-wide footer link to a dedicated `/feedback` page.
   - Accept general feedback, bug reports, and ideas with an optional contact email and the current-page context.
   - Store every valid submission in the private Supabase feedback table before attempting a best-effort Resend email notification.
   - Review submissions privately in the Supabase dashboard with:

```sql
select *
from internal.feedback_review
order by created_at desc;
```

## Next Steps

3. Internal report review queue
   - Add an internal/admin-facing view for question reports.
   - Include question text, answer choices, correct answer, source notes, report reason, report note, report status, and quick links to retire or review later.

4. More questions using the trivia-writing skill
   - Expand each sport bank in reviewed batches.
   - Require source notes, difficulty, sport, and clear wording checks before marking questions ready.

5. Daily 5 preview and swap system
   - Generate tomorrow's daily 5 as a draft the evening before.
   - Generate backup questions by sport/difficulty so weak questions can be swapped without rebuilding the whole challenge.

6. Automated verification report
   - Research the draft daily 5.
   - Report question text, answer choices, correct answer, source links, confidence notes, and suggested replacements.

7. Evening email
   - Email the verification report to Teddy.
   - Keep the first version review-only so publishing still depends on a human check.

8. Publish automation
   - Once the preview and email flow is reliable, publish the approved daily 5 automatically.
