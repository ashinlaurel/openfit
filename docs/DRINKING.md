# Drinking tracker demo

Wellbeing → Drinking is an interactive demo, also available through command-palette navigation. It is intentionally separate from Google Health, medical reports and assistant context. Fictional sample history covers eight weeks. Demo edits persist only in renderer localStorage (`openfit:drinking-demo:v1`), not an encrypted medical archive. Real-data storage should be implemented before using this as a personal medical record.

Entries contain date, label, total volume in ml, ABV percentage and optional notes. Multiple drinks can be logged on one date, edited or deleted. Spirits with mixers should use only spirit volume and its original strength. Zero-ABV drinks are supported. Dates cannot be future dates. Past and current days without a nonzero-ABV drink entry count as alcohol-free by default. Adding, editing or deleting a drink recalculates that status automatically. Future days remain separate. The completed streak ends yesterday and is bounded by the tracking start date (55 days before the initial demo, or an earlier recorded entry). Legacy explicit dry-day records are preserved for storage compatibility but no longer control the calendar.

Calculations:
- UK units = ml × ABV percentage ÷ 1,000.
- Estimated ethanol grams = ml × ABV percentage ÷ 100 × 0.789.
- US standard-drink equivalents = grams ÷ 14.

Calendar weeks start Monday. The eight-week chart labels elapsed days and marks the current week as incomplete. Week-to-week comparison uses the same elapsed weekdays. The personal reduction goal defaults to eight UK units as a demo preference, not a research-derived target. It is editable down to zero. The separately labelled UK guideline is no more than 14 units per week regularly, spread over three or more days if drinking that much. Above-guideline totals are highlighted. Lower totals are not described as safe.

At 56 g or more in a day, a contextual warning explains NIAAA's typical 4+/5+ US-drink thresholds for women/men within about two hours. Timing and individual sex are not collected, so the page never diagnoses a binge or estimates blood alcohol. No driving clearance or personalised risk prediction is provided.

Sources (linked in the UI):
- [NHS alcohol units](https://www.nhs.uk/live-well/alcohol-advice/calculating-alcohol-units/)
- [NHS weekly guideline](https://www.nhs.uk/live-well/alcohol-advice/the-risks-of-drinking-too-much/)
- [NIAAA binge drinking and 14 g standard drinks](https://www.niaaa.nih.gov/publications/brochures-and-fact-sheets/binge-drinking)
- [WHO alcohol risk](https://www.who.int/europe/news-room/04-01-2023-no-level-of-alcohol-consumption-is-safe-for-our-health)
- [NHS dependence and withdrawal support](https://www.nhs.uk/conditions/alcohol-use-disorder/)
