# **Payment Plan Page — UI & Technical Specification**

Redesign the **Payment Plan** step of the Luxor at Las Palmas Events proposal builder to match the attached reference image in both **visual hierarchy and functionality**.

The page should feel elegant, minimal, premium, easy for a client to understand, and consistent with the existing Luxor proposal builder.

## **1\. Overall Page Structure**

Keep the existing proposal-builder navigation at the top:

1. Details  
2. Services & Items  
3. Preview  
4. Payment Plan

The Payment Plan tab should be the active step.

Below the navigation, build the page in this exact order:

1. Page header \+ event date  
2. Financial summary cards  
3. Security deposit notice  
4. Payment schedule selector  
5. Generated payment schedule  
6. Total/payment deadline confirmation  
7. Additional payment notice  
8. Bottom actions

Do not add unnecessary sections, explanations, charts, or additional payment cards.

---

# **2\. Page Header**

### **Eyebrow**

`YOUR PAYMENT PLAN`

### **Main heading**

`Simple, flexible payments designed around your event.`

### **Supporting text**

`Venue Services are paid first, then payments go toward Event Services.`

On the right side, show an Event Date card:

**EVENT DATE**

`[event date]`

Below it:

`Final payment is due 60 days before your event.`

The event date must be pulled dynamically from the proposal/event record.

---

# **3\. Financial Summary Cards**

Display four horizontal cards:

### **Card 1**

**EVENT TOTAL**

`$[final event price]`

Small label:  
 `Total Investment`

This is the total of:

`Venue Services + Event Services`

Do NOT include the refundable security deposit in Event Total.

---

### **Card 2**

**DUE TODAY**

`$[booking deposit]`

Small label:  
 `Booking Deposit`

Add a small information icon.

The booking deposit is calculated automatically as:

**25% of Venue Services, with a $750 minimum.**

Formula:

`max(Venue Services × 25%, $750)`

The booking deposit must never exceed the Venue Services total.

The booking deposit is applied toward Venue Services.

---

### **Card 3**

**REMAINING EVENT BALANCE**

`$[event total - booking deposit]`

Small label:  
 `Balance After Deposit`

This excludes the refundable security deposit.

---

### **Card 4**

**SCHEDULED PAYMENTS**

`[2–5]`

Small label:  
 `Total Payments`

This number represents the number of scheduled payments selected by the client, including the booking deposit.

---

# **4\. Security Deposit Notice**

Immediately below the financial summary, display a subtle information banner.

### **Text:**

**Security Deposit: $750**

`Refundable deposit due 30 days before your event.`

`This amount is separate from your Event Total and will be refunded after your event, pending inspection and the terms of the agreement.`

Important logic:

* Security Deposit \= $750  
* It is NOT included in Event Total.  
* It is NOT included in Remaining Event Balance.  
* It is NOT part of the 2–5 payment schedule.  
* It is NOT applied toward Venue Services or Event Services.  
* It is due exactly 30 days before the event.  
* It is refundable according to the agreement.  
* It should be displayed separately throughout the proposal.

---

# **5\. Payment Schedule Selector**

Create a section titled:

### **`CHOOSE YOUR PAYMENT SCHEDULE`**

Supporting text:

`Select the number of payments that works best for you.`

Display four selectable options:

`2 Payments`  
 `3 Payments`  
 `4 Payments`  
 `5 Payments`

The default selected option should be:

**4 Payments**

Use the existing Luxor selected-state styling: dark/black background, gold outline/accent, and check icon.

The client should be able to click any available option and immediately see the schedule update.

---

# **6\. Payment Count Rules**

The system must dynamically determine which payment options are available based on how much time exists between the booking date and the final-payment deadline.

The final payment deadline is ALWAYS:

**60 days before the event date.**

Do not create payment dates after this deadline.

Recommended availability:

### **More than 8 months until event**

Allow:  
 2, 3, 4, or 5 payments

### **6–8 months until event**

Allow:  
 2, 3, or 4 payments

### **4–6 months until event**

Allow:  
 2 or 3 payments

### **60 days–4 months until event**

Allow:  
 2 payments

### **Less than 60 days until event**

Do not offer a payment plan. The remaining balance should be due according to the venue’s short-notice booking policy.

The system should never display a payment option that cannot realistically fit before the 60-day deadline.

---

# **7\. Payment Date Calculation**

This is critical.

Payment dates should be based on the **event date and final-payment deadline**, NOT on a fixed number of days after the previous payment.

Calculate:

**Final Payment Date \= Event Date − 60 days**

Then evenly space the scheduled payment dates between:

**Booking Date → Final Payment Date**

The booking deposit is always Payment \#1 and is due immediately.

For the remaining payments, distribute the available time evenly.

Example:

Booking Date:  
 January 1

Event Date:  
 September 1

Final Payment Deadline:  
 July 3

If the client selects 4 payments:

Payment 1 \= January 1  
 Payment 2 \= approximately March 2  
 Payment 3 \= approximately May 2  
 Payment 4 \= July 3

The exact dates should be calculated automatically.

Do not hard-code specific calendar dates.

---

# **8\. Payment Amount Calculation**

The booking deposit is calculated first:

`max(25% of Venue Services, $750)`

The booking deposit is applied toward Venue Services.

Then calculate:

`Remaining Event Balance = Event Total − Booking Deposit`

The remaining balance is distributed across the remaining scheduled payments.

Default behavior:

**Divide the remaining balance equally among the remaining scheduled payments.**

Handle rounding automatically so that the final payment always makes the total exactly equal to the Event Total.

Example:

Event Total \= $12,577

Booking Deposit \= $900

Remaining Balance \= $11,677

If 4 payments are selected:

Payment 1:  
 $900

Payments 2–4:  
 Divide the $11,677 balance across the remaining 3 payments.

The final payment should absorb any rounding difference.

---

# **9\. Venue Services Must Be Paid First**

Payment allocation must follow this rule:

**Venue Services are paid first.**

The system should apply each scheduled payment toward the outstanding Venue Services balance before applying money toward Event Services.

Example:

Venue Services \= $3,600

Booking Deposit \= $900

Remaining Venue Services \= $2,700

The next payment(s) are applied toward the $2,700 Venue Services balance first.

Once Venue Services reach $0:

`Venue Services Paid in Full`

All subsequent payments are applied toward Event Services.

This allocation should happen automatically in the backend.

The client-facing page should keep this simple and should NOT display complicated accounting calculations.

---

# **10\. Payment Schedule Display**

Below the payment selector, display:

### **`YOUR [X]-PAYMENT SCHEDULE`**

Use a simple table/list with four columns:

**PAYMENT**  
 **DESCRIPTION**  
 **DUE DATE**  
 **AMOUNT**

Each row should have a numbered circle and appropriate icon.

Example:

### **1**

**BOOKING DEPOSIT**  
 Secure your date

Due today

**$900**

Small secondary text:  
 `25% of Venue Services`

---

### **2**

**PAYMENT 2**

Venue Services / Event Services Payment

Due \[automatically calculated date\]

**$3,892.33**

---

### **3**

**PAYMENT 3**

Event Services Payment

Due \[automatically calculated date\]

**$3,892.33**

---

### **4**

**FINAL PAYMENT**

Remaining balance due

Due 60 days before your event

**$3,892.34**

The description should dynamically change based on where the payment falls in the Venue Services → Event Services allocation.

---

# **11\. Final Payment Requirement**

At the bottom of the payment schedule, display a confirmation card:

**TOTAL INVESTMENT**

`$[Event Total]`

Beside it:

✓ **Everything must be paid in full 60 days before your event.**

This should be visually prominent but not alarming.

---

# **12\. Additional Payments**

Below the schedule, add a subtle green/neutral information banner:

### **`Want to pay more, sooner?`**

`You can make additional payments toward your balance at any time.`

Additional payments are allowed but do NOT create additional scheduled installments.

If a client makes an extra payment:

* Apply it to the outstanding balance.  
* Apply it to Venue Services first if Venue Services are not yet paid.  
* Then apply it to Event Services.  
* Recalculate the remaining scheduled balances if necessary.  
* Never move the final-payment deadline beyond 60 days before the event.

---

# **13\. Security Deposit Must Remain Separate**

Do not allow the $750 security deposit to affect the payment schedule calculations.

For example:

Event Total:  
 $12,577

Booking Deposit:  
 $900

Remaining Event Balance:  
 $11,677

Security Deposit:  
 $750

The client should NOT see:

`$13,327 Event Total`

The correct display is:

**Event Total: $12,577**

**Security Deposit: $750 refundable**

The security deposit is an additional temporary deposit and is not part of the event price.

---

# **14\. Bottom Actions**

At the bottom of the page:

Left:  
 `SAVE PROPOSAL`

Right:  
 `SEND PROPOSAL`

Keep the Send Proposal button as the primary/high-emphasis action.

---

# **15\. Visual / Cosmetic Requirements**

Match the existing Luxor proposal-builder aesthetic.

Use:

* Warm white / cream background  
* White cards  
* Very subtle borders  
* Rounded corners  
* Black/dark charcoal typography  
* Luxor brown/gold accent color  
* Minimal green accents for confirmations/success states  
* Thin dividers  
* Generous spacing  
* Elegant serif font for major headings  
* Clean sans-serif font for labels/body text  
* Simple line icons  
* No excessive shadows  
* No gradients  
* No large colorful illustrations  
* No unnecessary decorative graphics

The page should feel **luxury, editorial, calm, and professional**, not like a generic financial dashboard.

---

# **16\. Important UX Principle**

The client should understand the page in approximately 5 seconds.

The hierarchy should be:

**How much is my event?**  
 ↓  
 **How much do I pay today?**  
 ↓  
 **How many payments do I want?**  
 ↓  
 **When are my payments due?**  
 ↓  
 **When is everything due?**

Do not overwhelm the client with internal payment-allocation logic.

The complex calculations should happen automatically in the application.

The client-facing UI should remain extremely simple.

---

# **17\. Core Business Rules**

Implement these rules globally:

1. Event Total \= Venue Services \+ Event Services.  
2. Security Deposit is NEVER included in Event Total.  
3. Security Deposit \= $750 refundable.  
4. Security Deposit is due 30 days before event.  
5. Booking Deposit \= 25% of Venue Services, minimum $750.  
6. Booking Deposit is applied toward Venue Services.  
7. Booking Deposit secures the event date once received and all required booking documents are completed.  
8. Client can select 2–5 scheduled payments when enough time exists.  
9. Payment \#1 is always the Booking Deposit.  
10. Remaining scheduled payment dates are evenly distributed between booking date and the 60-day final-payment deadline.  
11. Final scheduled payment is always due 60 days before the event.  
12. Venue Services are paid before Event Services.  
13. Additional payments may be made at any time.  
14. Additional payments do not count as scheduled installments.  
15. Final Event Balance must equal $0 by the 60-day deadline.  
16. Security Deposit remains separate from all event-payment calculations.  
17. Never create a scheduled payment after the 60-day deadline.  
18. Automatically recalculate dates and amounts whenever the event date, booking date, package, services, or number of payments changes.  
19. Preserve the client’s selected payment count when possible.  
20. If the selected payment count becomes impossible because the event date changes, automatically reduce the available options and clearly explain why.

The result should look and feel like the attached reference, but the payment logic should be fully dynamic rather than hard-coded. But also match the overall theme that we have going already.

