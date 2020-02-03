import * as functions from "firebase-functions";

/* =====================================================================
 *               Index Html ブラウザが最初にリクエストするところ
 *
 *          https://definy-lang.web.app/ など
 *              ↓ firebase.json rewrite
 *          Cloud Functions for Firebase / indexHtml
 * =====================================================================
 */

const escapeHtml = (text: string): string =>
  text.replace(/[&'`"<>]/g, (s: string): string =>
    s === "&"
      ? "&amp;"
      : s === "'"
      ? "&#x27;"
      : s === "`"
      ? "&#x60;"
      : s === '"'
      ? "&quot;"
      : s === "<"
      ? "&lt;"
      : s === ">"
      ? "&gt;"
      : ""
  );

export const indexHtml = functions.https.onRequest((request, response) => {
  if (request.hostname !== "definy-lang.web.app") {
    response.redirect("https://definy-lang.web.app");
    return;
  }
  response.status(200);
  response.setHeader("content-type", "text/html");
  response.send(`<!doctype html>
<html lang="ja">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Definy</title>
    <link rel="icon" href="/assets/icon.png">
    <meta name="description" content="ブラウザで動作する革新的なプログラミング言語">
    <meta name="twitter:card" content="summary_large_image">
    <meta property="og:url" content="https://definy-lang.web.app${request.url}">
    <meta property="og:title" content="${escapeHtml(
      "タイトル" + Math.random().toString()
    )}">
    <meta property="og:site_name" content="Definy">
    <meta property="og:description" content="${escapeHtml("説明文!")}">
    <meta property="og:image" content="${escapeHtml(
      "https://definy-lang.web.app/assets/icon.png"
    )}">
    <link rel="manifest" href="/assets/manifest.json">
    <style>
        /*
            Hack typeface https://github.com/source-foundry/Hack
            License: https://github.com/source-foundry/Hack/blob/master/LICENSE.md
        */

        @font-face {
            font-family: "Hack";
            font-weight: 400;
            font-style: normal;
            src: url("/assets/hack-regular-subset.woff2") format("woff2");
        }

        html {
            height: 100%;
        }

        body {
            height: 100%;
            margin: 0;
            background-color: black;
            display: grid;
        }

        * {
            box-sizing: border-box;
            color: white;
        }
    </style>

    <script src="/main.js" defer></script>
</head>

<body>
    読み込み中……
</body>

</html>`);
});
