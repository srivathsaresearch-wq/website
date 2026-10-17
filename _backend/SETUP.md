# Connect the website to the Google Sheet (about 15 minutes)

Do every step **signed in as srivathsaresearch@gmail.com** (and only that account: in Chrome, use a profile or an Incognito window with just that account, otherwise Google may open Apps Script under a different account). The sheet, the script, the calendar events and the emails then all belong to that account.

The folder `_backend` is never published on the website (GitHub Pages skips folders that start with `_`), and this code holds no passwords or keys.

## 1. Make the sheet and paste the script

1. Go to **sheets.new**. Name the sheet `Research by Srivathsa: sign-ups`.
2. **Extensions → Apps Script.** Rename the project to `RBS website`.
3. Delete everything in `Code.gs` and paste in the whole of `_backend/Code.gs`.
4. On the left, next to **Services**, click **+**, choose **Google Calendar API**, click **Add**.
5. At the top of the code, check `SETTINGS`:
   - `MEETING_TOOL: 'meet'` makes a Google Meet link for each Saturday by itself. To use Zoom instead, set `'fixed'` and paste a recurring Zoom meeting link into `FIXED_MEETING_LINK`.
   - `FEEDBACK_FORM_URL`: paste a Google Form link when you have one (feedback emails wait until then).
   - `TEST_EMAIL`: an address of yours that isn't srivathsaresearch@gmail.com, for the test in step 4.
   - The monthly members' Q&A call for one-year support: see step 5. Nothing is sent for it until you set a date.
6. Save (Ctrl+S). In the function menu at the top choose **setup**, click **Run**, and approve the permissions. Google warns that the app "isn't verified": it is your own script, so click **Advanced → Go to RBS website (unsafe)**. The sheet now has tabs for Class sign-ups, One-year support, Contact, Newsletter and Payments.

## 2. Publish it as the forms endpoint

1. **Deploy → New deployment.** Gear icon → **Web app**.
2. Execute as: **Me**. Who has access: **Anyone**. (Anyone means the website's visitors can submit forms without a Google login. They can't read the sheet.)
3. **Deploy** and copy the **Web app URL** (it ends in `/exec`).
4. In `config.js`, paste it into `FORMS_ENDPOINT: "…"`. Leave the other `…_ENDPOINT` lines empty: every form then goes to the sheet. Upload the new `config.js` to GitHub.

When you change the script later, use **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**, so the URL stays the same.

## 3. Connect Razorpay (payment window on the site, rows marked "Paid" at once)

The site uses **Razorpay Standard Checkout**: after the sign-up form, the Razorpay payment window opens on the page itself. The script makes the order, checks Razorpay's signature on the result, and only then marks the row "Paid" and sends the emails. The price (₹199 and ₹3,000) is set in `SETTINGS` in `Code.gs`, never taken from the browser.

1. Razorpay Dashboard → **Account & Settings → API Keys → Generate Test Key**. Start in **Test mode**.
2. In Apps Script: **Project Settings (gear) → Script properties → Add script property**, twice:
   - `RAZORPAY_KEY_ID` = the key id (`rzp_test_…`, later `rzp_live_…`)
   - `RAZORPAY_KEY_SECRET` = the key secret
   Keep the secret here only. It is not in `config.js`, the sheet, GitHub or any email, and the website never receives it.
3. Make sure `CLASS_PAYMENT_LINK` and `SUPPORT_PAYMENT_LINK` in `config.js` are **empty** (a link there sends people to a Razorpay Payment Page instead of the on-site window).
4. **Deploy → Manage deployments → Edit → New version → Deploy**, so the script picks up the new settings.

If the visitor closes the window or the payment fails, their details stay in the sheet as "Pending" and they can simply press the button again (that reuses the same row; it doesn't add a new one). A failed attempt is written in the row's `notes` with Razorpay's reason. If nothing is paid within 2 hours (`UNPAID_AFTER_HOURS`), the row turns **"Not paid"** by itself and gets no emails. A payment that still arrives later turns it "Paid" as normal. If they pay but their browser closes before the page confirms it, the script's 10-minute check finds the payment in Razorpay and completes it. A payment with no matching sign-up still gets a row, and one at an unexpected amount is emailed to you. Until the keys are in, a visitor who submits the form sees "online payment is not switched on yet" and their details are still saved; you can type `Paid` in the status column by hand and everything after it still happens.

**Test mode vs live:** test keys charge nothing. Razorpay's test window shows a "Test Mode" ribbon and has buttons for a successful or failed payment. For live, generate live keys, replace the two Script properties, and make a real ₹199 payment yourself. Never paste a live key secret into a chat or a document.

## 4. Test before going live

1. In Apps Script, choose **testBooking** and click **Run**. Within a minute `TEST_EMAIL` should get the confirmation email with the Meet link and a Google Calendar invite, and your calendar shows "Investing basics, start to finish (live class)" on the next Saturday. Delete the test row from the sheet afterwards.
2. On the live site (or locally with `FORMS_ENDPOINT` set), fill the class form and press **Continue to payment**. A "Pending" row appears and the Razorpay window opens showing ₹199 and "Test Mode".
3. Complete the test payment (Razorpay's test window offers a success option; no real money moves). You land on the thank-you page, the row turns "Paid" straight away, the confirmation email arrives with the Meet link, and the Payments tab logs it.
4. Try the failure paths: close the window (message says your details are saved), and choose the test "failure" option (message says you have not been charged).
5. Fill the form, close the window and wait: the row turns "Not paid" about 2 hours later. Then run **checkSheet** and read the log.
6. Add a second test email to the same class and check the first guest is **not** sent a second invite. (If they are, set `SEND_CALENDAR_INVITES: false`: the confirmation email still carries the link.)
7. Switch Razorpay to Live mode, replace the two keys with the live ones, and make one real ₹199 payment yourself.

## 5. One-year support: members' calls, end-of-year emails, the interest list

**Monthly members' Q&A call.** In `SETTINGS`, choose when it happens, then deploy a new version (see step 2):
- `MEMBERS_CALL_DAY: 15` puts it on the 15th of every month (a day the month doesn't have, such as 31, means that month's last day), **or**
- `MEMBERS_CALL_DATES: ['2026-11-15', '2026-12-13']` lists exact dates. A filled list wins over `MEMBERS_CALL_DAY`. A date can carry its own time: `'2026-12-20 18:30'`.
- `MEMBERS_CALL_START: '19:00'` is the time in IST, and `MEMBERS_CALL_MINUTES: 60` the length.

Seven days before each call (`MEMBERS_CALL_INVITE_DAYS`), the script makes one Google Calendar event with its own Meet link (always Meet, whatever `MEETING_TOOL` says) and adds every member whose year covers that date as a guest. Guests can't see each other. Each member also gets an email with the date and link. Anyone who joins after the invites have gone out is added straight away. The `last_call_invite` column shows the last call each member was emailed about. While both settings are empty nothing is sent, and the morning check emails you if there are paying members but no call in the next 45 days. Once a date is set, the welcome email also gives the date of the next call.

**End of the year.** About 14 days before a member's `ends` date (`SUPPORT_ENDING_REMINDER_DAYS`), they get one email saying their support ends then, that it doesn't renew by itself, and how to join again. The `ending_reminder_sent` column is stamped. Someone who has already paid for another year gets no email (`skipped: renewed`). Keep `starts` and `ends` written like `17 October 2027`; **checkSheet** lists any it can't read.

**The register-interest list (once).** People who registered interest before support opened are the rows with status `Interest`. To tell them it is open, choose **emailInterestList** in the function menu and click **Run**, once. Each gets one email with the link to sign up, and their `notes` say `Support-open email sent`. Anyone who has already signed up, or appears twice, is skipped and noted. It never runs by itself, and running it again only emails rows that haven't been sent yet. If the log says some are still to send (the daily email limit), run it again the next day.

## Everyday use

| You want to… | Do this |
|---|---|
| See who's coming this Saturday | Class sign-ups tab, filter `class_date` and `status = Paid`. The calendar event's guest list shows the same. |
| Move someone to a later Saturday | Change their `class_date` to the new date in the same format (`2026-10-24T15:00:00+05:30`), clear `confirmation_sent`, `reminder_24h_sent`, `reminder_1h_sent` and `feedback_sent`, and remove them from the old calendar event. The script sends a fresh confirmation. |
| Add someone who paid another way | Add a row with name, email, `class_date` and `status = Paid`. |
| Stop all emails | Apps Script → Triggers (clock icon) → delete the `every10Minutes` trigger. Run `setup` to turn it back on. |
| See errors | Apps Script → Executions. A failed confirmation also writes the reason in the row's `notes`. |
| Check the sheet is healthy | Apps Script → choose **checkSheet** → **Run**. The log lists anything that needs a look (paid but no email, paid twice for one class, a mistyped status, a payment with no sign-up, test mode, the timer missing) and how many paid seats the next class has. The same check runs by itself every morning around 9 am and emails you only if it finds something. |
| Move or cancel a members' call | Change `MEMBERS_CALL_DAY` / `MEMBERS_CALL_DATES` and deploy a new version. If invites for the old date have already gone out, delete that event in Google Calendar (Google tells the guests). A new date inside the 7 days gets a new event, and every member is emailed again. |
| Cancel someone by hand | Set their `status` to `Cancelled`. The statuses the script uses are Pending, Paid, Not paid, Interest (support) and Cancelled. |
| Add your own column | Go ahead, anywhere. The script finds its columns by the heading in row 1, so keep those headings as they are. |

## Limits worth knowing

- **Email:** a free Gmail account can send to about 100 recipients a day from a script. Each paid seat uses 3 to 4 emails (confirmation, two reminders, feedback), so this is fine for a small group. Each support member gets a welcome, one email per monthly call and one at the end of their year. A long interest list may take more than one day: `emailInterestList` keeps 10 emails spare and tells you if it has to stop. Emails come from srivathsaresearch@gmail.com with replies going to hello@researchbysrivathsa.com.
- **Google Meet on a free account:** calls with 3 or more people stop at 60 minutes. The class is exactly 60 minutes, so any overrun gets cut off. A Google One plan that includes longer Meet calls, or Google Workspace, removes this. Zoom's free plan stops at 40 minutes, so Zoom needs a paid plan either way.
- **Meet admission:** guests who join signed in with the invited Google account come straight in. Anyone else (for example a Yahoo address, or a different Google account) lands on "Ask to join" and you admit them during class.
