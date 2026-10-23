# Maeil News: daily card maker

Every 6 hours this makes Korean news cards from six korea.net categories, four articles each, 24 in total.
The cards go to a web address that the Maeil News widget reads.

You don't need to run anything on your computer. GitHub does the work.

## What you need

- A free GitHub account (github.com).
- An API key from your AI provider (OpenAI, Claude or Gemini).

## Setup, step by step

**Step 1. Create a repository**

1. Log in to github.com.
2. Click the **+** at the top right, then **New repository**.
3. Name it `maeil-news`. Choose **Public**. Click **Create repository**.

**Step 2. Upload these files**

1. On the new repository page, click **uploading an existing file**.
2. Drag the whole contents of this `maeil-news-generator` folder into the page.
   Make sure the folders `docs`, `state` and `.github` are included.
3. Scroll down and click **Commit changes**.

**Step 3. Add your AI key (keep it secret)**

1. In the repository, click **Settings** (top menu), then **Secrets and variables**, then **Actions**.
2. Click **New repository secret**.
3. Name: `AI_API_KEY`. Secret: paste your API key. Click **Add secret**.

**Step 4. Turn on the web page that publishes the cards**

1. Click **Settings**, then **Pages** (left menu).
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Branch: **main**. Folder: **/docs**. Click **Save**.
4. After a minute, GitHub shows your address, for example `https://yourname.github.io/maeil-news/`.
   The cards will be at `https://yourname.github.io/maeil-news/cards.json`.

**Step 5. Make the first set of cards now**

1. Click the **Actions** tab.
2. Click **Maeil News cards** on the left, then **Run workflow**, then the green **Run workflow** button.
3. Wait about 2 minutes. A green tick means it worked.

After this, it runs by itself every 6 hours.

## Turning it off

Open the file `config.json` in the repository, click the pencil icon, change `"enabled": true` to `"enabled": false`, and click **Commit changes**.
The next run makes no AI calls and the widget shows nothing new.

To stop it completely, click **Actions**, then **Maeil News cards**, then the **...** menu, then **Disable workflow**.

## Money

- Each day makes one AI call with 24 cards. This costs cents.
- `config.json` has a monthly limit, `monthly_cap_usd`, set to $2. When the limit is reached, the cards switch to English only until next month.
- The model and prices in `config.json` must match your provider. Check your provider's price page and change them if needed.

## When the AI is out of credits

The cards switch to English titles only, without Korean. The system tries again every 6 hours, and the Korean cards return on the first run after credits are added.

## What the file looks like

`docs/cards.json` holds the date, a status (`ai`, `fallback`, `off`, `cap reached`, `no key`), a short note, and the 24 cards.
You can open the address in a browser to check it.
