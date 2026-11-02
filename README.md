# Evergreen - Pack 47 Sales

A mobile-first, installable, offline wreath and candle order tracker. No account, backend, analytics, external fonts, or third-party dependencies. Customer information stays in browser storage on the device.

**App address (after enabling GitHub Pages):** https://justing1319.github.io/Wreath-Sales-App/

## Run

From this directory, run `npm start` and open `http://localhost:4173`. Run `npm test` for the data-validation, pricing, summary, and CSV tests.

## Put it on your phone

Publish this directory to an **HTTPS static host** such as GitHub Pages. No build is required. Keep the files together; relative paths support deployment in a subdirectory.

Open the published HTTPS address on your phone while online and wait for **Offline ready**. On iPhone, use Safari's Share menu → **Add to Home Screen**. On Android, use Chrome's **Install app** menu or the in-app Install button. The app then opens on its own and works without a connection.

An HTTP LAN address is only useful for viewing the interface: mobile browsers require HTTPS for service workers. `localhost` is exempt on the development machine.

## Orders and backups

- **Donation amount ($)** accepts an optional dollar amount with cents, either alongside goods or on its own with both quantities at zero. Donation-only entries need a name but no address and never appear in delivery lists. Adding items requires an address.
- Every order tile shows **Donation: $amount** separately from the combined order total, including **Donation: $0** for orders without a donation. Delivery tiles show the same breakdown.
- Order totals, the collected total, and Venmo order amounts include donations. The dashboard has two equal top-row tiles for total sales (including donations) and order count, followed by three equal tiles for wreaths sold, candles sold, and donation dollars. Each tile shows only its label and value. Donation amounts are preserved in backups and included in a separate CSV column; older orders and backups without a donation field count as $0.

- Record customer name, address, optional phone, quantities, payment method (cash/check/Venmo), delivery location, delivery status, and notes.
- Tap a quantity to use the browser's native selection interface (the system picker on iPhone), with values from 0 to 999. Totals update when the selection changes.
- Wreaths cost **$20** and candles **$13**, following the photographed sheet's header. Its sample $15 wreath total is inconsistent and is not used.
- Every entered order is considered paid; no separate payment-received checkbox is needed. Existing unpaid orders are marked paid when this version loads, and restored backups are also marked paid. The backup and CSV `Paid` fields remain for compatibility.
- Selecting **Check** in the order form shows **Checks payable to Holliston Pack 47** below the payment selector, including when editing a saved check order. It is hidden for Cash and Venmo; there is no separate bottom-of-page reminder.
- New orders start undelivered. Edit orders to change sales details, payment method, or delivery instructions. Delivery status and photos are managed separately in **Delivery mode**, not the order form.
- To delete, edit the order and choose **Delete order**. A separate confirmation asks you to type the customer's full name exactly (including capitalization) before **Delete permanently** unlocks. **Keep order**, closing the dialog, or Escape cancels without deleting.
- Search by name, address, or phone. Filter undelivered orders.
- Choose **Venmo QR setup** in the footer to upload one shared fundraiser QR screenshot (PNG, JPEG, or WebP, up to 10 MB). It is resized to at most 1600 pixels and saved locally as PNG; overly large processed images or storage failures are reported without replacing the previous screenshot.
- **Show Venmo QR** appears on Venmo order cards and in the entry form when Venmo is selected. It opens the shared image and that order's name/total, including before saving. Have the customer scan it on their own phone and enter the amount. The app does not decode the QR, generate a Venmo payment URL, or verify payment; check the code and recipient yourself.
- The QR image works offline after upload and stays on this device. Keep its original screenshot to upload again on another device; order backups contain orders only, not the shared QR setting.
- **Export CSV** exports all orders, regardless of active filters, for Excel or other spreadsheets.
- **Back up orders** downloads a version 2 JSON file including delivery dates and photos. **Restore backup** accepts both old version 1 and new version 2 files (up to 100 MB), validates all orders/photos, and asks before replacing current orders. CSV is for spreadsheet use, not restoration; it includes delivery dates and whether a photo exists, not the image itself.

## Delivery round

Switch to **Delivery mode** when the goods are ready, even if that is a month after selling. It initially shows **To deliver**, with name, address, phone, wreath/candle quantities, delivery location, and notes. Search customers or switch between **All orders**, **To deliver**, and **Delivered**.

Delivery lists follow this route: Richard Road odd numbers low to high, Richard Road even numbers high to low, Temi Road even numbers high to low, Temi Road odd numbers low to high through 33, Scott Road low to high, remaining Temi Road odd numbers low to high (continuing toward 45), Day Road low to high, then Woods Crossing low to high. The Scott Road detour is retained even when 33 or 45 Temi has no order. Matching ignores capitalization and accepts Road/Rd/Rd. and Crossing/Xing. Enter the house number first. Other or unrecognized addresses appear at the end in newest-first order, never omitted. Search and all delivery filters retain route order; Sales mode stays newest-first. Stored order data and CSV/backup ordering are unchanged by route sorting.

Tap **Deliver** after leaving the items. Choose **Take photo** to open the phone's camera (rear camera where supported) or **Choose photo** for an existing picture. Review the preview, then **Save photo & mark delivered**. A photo is optional: **Mark delivered without photo** also records the delivery date. Selecting an image alone never marks the order delivered. Canceling a draft photo asks before discarding it.

Completed orders leave the pending list and appear under **Delivered**. **View delivery** shows the saved photo/date and allows adding or replacing a photo. **Undo delivery** asks for confirmation, clears the date/photo, and returns the order to the pending list. Deleting the whole order with the existing typed-name confirmation also deletes its photo.

Photos are resized to at most 1280 pixels and stored as JPEG without the source file's metadata. Images must be below 20 MB before processing and 2 MB of encoded data afterward. Unsupported images or storage failures show an error and leave the previous record intact. iPhone camera/file-picker behavior is controlled by iOS; if an image format cannot be opened, choose JPEG or PNG. Avoid photographing people or other private information.

Orders and delivery photos use **IndexedDB**, which supports larger device-local storage than the old small text-storage limit. Existing orders migrate automatically on first load; the older localStorage copy is left untouched for recovery but is no longer updated. The migration preserves delivered status and other data, and all orders remain paid as previously configured. Saving uses a revision check in an IndexedDB transaction so two tabs cannot overwrite each other's changes. A tab detecting another writer requires reloading.

Orders and photos do not sync between devices. Back up regularly, especially before clearing browser data, changing browsers, moving devices, or reinstalling, and before/after the delivery round. Browser storage can be evicted and is not encrypted by this app; use a device lock and protect exported backup files, which now contain photos. The shared Venmo screenshot remains a separate localStorage setting and is not part of order backups.

## Payment reports

Open **Reports** for Cash, Check, and Venmo collected totals, a **Cash + Venmo** subtotal excluding checks, and **Total collected** across all three methods. Totals include donations and donation-only entries, use all saved orders on this device regardless of search or delivery filters, and work offline. Changing an order's amount/payment method, deleting an order, or restoring a backup updates the report. These are recorded payments, not a live verification of Venmo or bank transactions.

Above the payment report, **Sales breakdown** shows wreaths sold × $20 = wreath revenue, candles sold × $13 = candle revenue, donations, and a **Grand total** combining all three. It uses the same saved orders and prices as order totals, including donation-only entries.

## Selling rewards

On **Reports**, **Selling rewards** calculates the Fiske's gift certificate earned for one scout from all saved wreath quantities: the first 25 earn $0.25 each, the next 25 (26–50) earn $0.50 each, and wreaths 51 onward earn $0.75 each. Rates are marginal, not retroactive: 30 wreaths earn `25 × $0.25 + 5 × $0.50 = $8.75`; 51 earn `$19.50`. The report shows each tier's count, rate, subtotal, and the total certificate value. Candles and donations are excluded; delivery status and search filters do not affect rewards. Edits, deletions, and restored backups automatically update the calculation, including offline.

## App updates

When changing cached app files, increment the cache version in `sw.js`. An update installs in the background and activates after all old app tabs/windows close. Only this app's prefixed caches are cleaned up; saved orders are unaffected. The server must serve `sw.js` as JavaScript and `manifest.webmanifest` as JSON/manifest content.
