import * as functions from "firebase-functions";
import * as html from "@narumincho/html";
import { URL } from "url";

const hostName = "definy-lang.web.app";

const origin = "https://" + hostName;
/* =====================================================================
 *               Index Html ブラウザが最初にリクエストするところ
 *
 *          https://definy-lang.web.app/ など
 *              ↓ firebase.json rewrite
 *          Cloud Functions for Firebase / indexHtml
 * =====================================================================
 */

export const indexHtml = functions.https.onRequest((request, response) => {
  if (request.hostname !== hostName) {
    response.redirect(origin);
    return;
  }
  response.status(200);
  response.setHeader("content-type", "text/html");
  response.send(
    html.toString({
      appName: "Definy",
      pageName: "Definy",
      iconPath: ["assets", "icon.png"],
      coverImageUrl: new URL(origin + "/assets/icon.png"),
      description: "ブラウザで動作する革新的なプログラミング言語",
      scriptUrlList: [new URL(origin + "/main.js")],
      styleUrlList: [],
      javaScriptMustBeAvailable: true,
      twitterCard: html.TwitterCard.SummaryCard,
      language: html.Language.Japanese,
      manifestPath: ["assets", "manifest.json"],
      origin: "https://definy-lang.web.app",
      path: request.url.substring(1).split("/"),
      style: `/*
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
  }`,
      body: [html.div({}, "Loading Definy ...")]
    })
  );
});
