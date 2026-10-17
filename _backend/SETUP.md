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
6. Save (Ctrl+S). In the function menu at the top choose **setup**, click **Run**, and approve the permissions. Google warns that the app "isn't verified": it is your own script, so click **Advanced → Go to RBS website (unsafe)**. The sheet now has tabs for Class sign-ups, 1-1, Contact, Newsletter and Payments.

## 2. Publish it as the forms endpoint

1. **Deploy → New deployment.** Gear icon → **Web app**.
2. Execute as: **Me**. Who has access: **Anyone**. (Anyone means the website's visitors can submit forms without a Google login. They can't read the sheet.)
3. **Deploy** and copy the **Web app URL** (it ends in `/exec`).
4. In `config.js`, paste it into `FORMS_ENDPOINT: "…"`. Leave the other `…_ENDPOINT` lines empty: every form then goes to the sheet. Upload the new `config.js` to GitHub.

When you change the script later, use **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**, so the URL stays the same.

## 3. Connect Razorpay (marks rows "Paid" by itself)

1. Razorpay Dashboard → **Account & Settings → API Keys → Generate key**. Start in **Test mode**.
2. In Apps Script: **Project Settings (gear) → Script properties → Add**:
   - `RAZORPAY_KEY_ID` = the key id (`rzp_test_…`, later `rzp_live_…`)
   - `RAZORPAY_KEY_SECRET` = the key secret
   Keep the secret here only. Never put it in `config.js`, the sheet, GitHub or an email.
3. On the Payment Page, make **email** a required field, so payments can be matched to sign-ups.

Every 10 minutes the script reads new captured payments. A ₹199 payment marks the newest "Pending" class row with the same email as "Paid"; a ₹3,000 payment does the same in the One-year support tab and sends the welcome email. A payment with no matching sign-up still gets a row, and one at an unexpected amount is emailed to you. Until the keys are in, you can type `Paid` in the status column by hand and everything after it still happens.

## 4. Test before going live

1. In Apps Script, choose **testBooking** and click **Run**. Within a minute `TEST_EMAIL` should get the confirmation email with the Meet link and a Google Calendar invite, and your calendar shows "Investing basics, start to finish (live class)" on the next Saturday. Delete the test row from the sheet afterwards.
2. Run the site locally (or live), fill the class form: a "Pending" row appears.
3. Pay the ₹1 test-mode page with that email. Within 10 minutes the row turns "Paid", the confirmation goes out, and the Payments tab logs it.
4. Add a second test email to the same class and check the first guest is **not** sent a second invite. (If they are, set `SEND_CALENDAR_INVITES: false`: the confirmation email still carries the link.)
5. Switch Razorpay to Live mode, replace the two keys with the live ones, and remove `1` from `CLASS_AMOUNTS_INR`.

## Everyday use

| You want to… | Do this |
|---|---|
| See who's coming this Saturday | Class sign-ups tab, filter `class_date` and `status = Paid`. The calendar event's guest list shows the same. |
| Move someone to a later Saturday | Change their `class_date` to the new date in the same format (`2026-10-24T15:00:00+05:30`), clear `confirmation_sent`, `reminder_24h_sent`, `reminder_1h_sent` and `feedback_sent`, and remove them from the old calendar event. The script sends a fresh confirmation. |
| Add someone who paid another way | Add a row with name, email, `class_date` and `status = Paid`. |
| Stop all emails | Apps Script → Triggers (clock icon) → delete the `every10Minutes` trigger. Run `setup` to turn it back on. |
| See errors | Apps Script → Executions. A failed confirmation also writes the reason in the row's `notes`. |

## Limits worth knowing

- **Email:** a free Gmail account can send to about 100 recipients a day from a script. Each paid seat uses 3 to 4 emails (confirmation, two reminders, feedback), so this is fine for a small group. Emails come from srivathsaresearch@gmail.com with replies going to hello@researchbysrivathsa.com.
- **Google Meet on a free account:** calls with 3 or more people stop at 60 minutes. The class is exactly 60 minutes, so any overrun gets cut off. A Google One plan that includes longer Meet calls, or Google Workspace, removes this. Zoom's free plan stops at 40 minutes, so Zoom needs a paid plan either way.
- **Meet admission:** guests who join signed in with the invited Google account come straight in. Anyone else (for example a Yahoo address, or a different Google account) lands on "Ask to join" and you admit them during class.
