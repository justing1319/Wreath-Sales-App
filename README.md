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

- Record customer name, address, optional phone, quantities, payment method (cash/check/Venmo), delivery location, delivery status, and notes.
- Tap a quantity to use the browser's native selection interface (the system picker on iPhone), with values from 0 to 999. Totals update when the selection changes.
- Wreaths cost **$20** and candles **$13**, following the photographed sheet's header. Its sample $15 wreath total is inconsistent and is not used.
- Every entered order is considered paid; no separate payment-received checkbox is needed. Existing unpaid orders are marked paid when this version loads, and restored backups are also marked paid. The backup and CSV `Paid` fields remain for compatibility.
- New orders start undelivered. Edit orders to change the payment method or record delivery.
- To delete, edit the order and choose **Delete order**. A separate confirmation asks you to type the customer's full name exactly (including capitalization) before **Delete permanently** unlocks. **Keep order**, closing the dialog, or Escape cancels without deleting.
- Search by name, address, or phone. Filter undelivered orders.
- **Export CSV** exports all orders, regardless of active filters, for Excel or other spreadsheets.
- **Back up orders** downloads a JSON file. **Restore backup** validates the file and asks before replacing current orders. CSV is for spreadsheet use, not restoration.

Orders do not sync between devices. Back up regularly, especially before clearing browser data, changing browsers, moving devices, or reinstalling. Browser storage is not encrypted by this app; use a device lock and protect exported files. A second tab detecting storage changes requires a reload to avoid overwriting newer orders.

## App updates

When changing cached app files, increment the cache version in `sw.js`. An update installs in the background and activates after all old app tabs/windows close. Only this app's prefixed caches are cleaned up; saved orders are unaffected. The server must serve `sw.js` as JavaScript and `manifest.webmanifest` as JSON/manifest content.
