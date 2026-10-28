# Setting up ManageBac sync

After this setup, your tracker pulls in new ManageBac assignments by itself
every time you open it (and every 30 minutes while it's open).
You only do this once.

## Step 1: Get your ManageBac calendar link

1. Log in to ManageBac.
2. On **My Workspace**, click **View Full Calendar**.
3. Click **Subscribe to Calendar** and copy the link it shows you.
   It usually starts with `webcal://` or `https://` and contains `managebac`.

> **Keep this link private.** Anyone who has it can see your schedule.
> Don't post it, share it, or put it in your code on GitHub.
> The tracker only saves it inside your own browser.

## Step 2: Try syncing without a server

1. Log in to the tracker and open **Settings** (or click **Connect ManageBac** at the bottom of the side menu).
2. Paste your link into **ManageBac calendar link**.
3. Click **Save and sync**.

If you see "Synced", you're done! 🎉

If you see "Your browser blocked the direct download", that's normal.
Browsers block websites from reading other websites' data unless that site allows it.
Go to step 3.

## Step 3: Make your free sync server (Cloudflare Worker)

The sync server is the small file `worker/worker.js`. It downloads your
ManageBac calendar and hands it to your tracker. It only works with ManageBac
links and doesn't save anything.

> You need a free Cloudflare account. Ask a parent to help you create it,
> since online services often have age rules.

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) and sign up or log in.
2. Open **Workers & Pages** and create a new Worker (start from the "Hello World" template).
3. Name it something like `homework-sync` and click **Deploy**.
4. Click **Edit code**, delete everything in the editor, and paste in all of `worker/worker.js`.
5. Click **Deploy** again.
6. Copy your Worker's address. It looks like
   `https://homework-sync.your-name.workers.dev`

Test it: open that address in your browser. You should see
"The sync server is running."

## Step 4: Connect the tracker to your server

1. In the tracker, open **Settings**.
2. Paste the Worker address into **Sync server link**.
3. Click **Save and sync**.

You should now see something like "Synced: 12 new."

## Optional: lock the server to your own tracker

Once your tracker is online (for example on GitHub Pages), open `worker.js`
in Cloudflare and change:

```js
const ALLOWED_ORIGIN = "*";
```

to your tracker's address, for example:

```js
const ALLOWED_ORIGIN = "https://your-username.github.io";
```

Then deploy again. Now only your tracker can use your server.
(If you do this, opening `index.html` straight from your computer won't sync anymore,
only the online version will.)

## How syncing behaves

- **New assignments** from ManageBac are added, with a small "ManageBac" tag.
- **Changed assignments** (new title or date) are updated.
- **Assignments a teacher deletes** are removed, unless you already finished them.
- **Your checkmarks never get undone** by syncing.
- **If you delete an imported assignment**, it won't come back on the next sync.
- Items due more than 14 days ago are skipped, so old stuff doesn't flood your list.

## Subjects look wrong?

Every school's calendar is a bit different. The tracker guesses the subject from
titles like `Math: Problem set` or `[Math] Problem set`. If your school's titles
look different, change the `subjectAndTitle()` function in `js/managebac.js`.
That's a great first edit to practice on!

## Troubleshooting

| Message | What to do |
| --- | --- |
| "Couldn't reach your sync server" | Check the Worker address, and that you're online. |
| "The sync server answered with an error (403)" | The calendar link isn't a ManageBac link. Copy it again. |
| "The sync server answered with an error (502)" | ManageBac didn't return your calendar. The link may have expired; get a new one in ManageBac. |
| "That link didn't return a calendar" | Copy the link again from **Subscribe to Calendar**. |
