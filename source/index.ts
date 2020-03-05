import * as functions from "firebase-functions";
import * as html from "@narumincho/html";
import { URL } from "url";
import * as common from "definy-common";

type Origin = { _: "releaseOrigin" } | { _: "debugOrigin"; portNumber: number };

/* =====================================================================
 *               Index Html ブラウザが最初にリクエストするところ
 *
 *          https://definy-lang.web.app/ など
 *              ↓ firebase.json rewrite
 *          Cloud Functions for Firebase / indexHtml
 * =====================================================================
 */

export const indexHtml = functions.https.onRequest((request, response) => {
  const requestUrl = "https://" + request.hostname + request.path;
  const languageAndLocation: common.data.LanguageAndLocation = common.urlToLanguageAndLocation(
    requestUrl
  );
  const normalizedUrl = common.languageAndLocationToUrl(languageAndLocation);
  console.log("requestUrl", requestUrl);
  console.log("normalizedUrl", normalizedUrl);
  // if (requestUrl !== normalizedUrl) {
  //   response.(normalizedUrl, 301);
  //   return;
  // }
  response.status(200);
  response.setHeader("content-type", "text/html");
  response.send(
    html.toString({
      appName: "Definy",
      pageName: "Definy",
      iconPath: ["assets", "icon.png"],
      coverImageUrl: new URL(common.origin + "/assets/icon.png"),
      description: description(languageAndLocation),
      scriptUrlList: [new URL(common.origin + "/main.js")],
      styleUrlList: [],
      javaScriptMustBeAvailable: true,
      twitterCard: html.TwitterCard.SummaryCard,
      language: html.Language.Japanese,
      manifestPath: ["assets", "manifest.json"],
      origin: common.origin,
      path: new URL(normalizedUrl).pathname.substring(1).split("/"),
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
      body: [html.div({}, loadingMessage(languageAndLocation.language))]
    })
  );
});

const loadingMessage = (language: common.data.Language): string => {
  switch (language) {
    case "English":
      return "Loading Definy ...";
    case "Japanese":
      return "Definyを読込中……";
    case "Esperanto":
      return "Ŝarĝante Definy ...";
  }
};

const description = (
  languageAndLocation: common.data.LanguageAndLocation
): string => {
  switch (languageAndLocation.language) {
    case "English":
      return "Definy is Web App for Web App.";
    case "Japanese":
      return "ブラウザで動作する革新的なプログラミング言語!";
    case "Esperanto":
      return "Noviga programlingvo, kiu funkcias en la retumilo";
  }
};

/* =====================================================================
 *               Api データを取得したり変更したりする
 *    https://us-central1-definy-lang.cloudfunctions.net/api
 * =====================================================================
 */
export const api = functions.https.onRequest((request, response) => {
  const corsResult = supportCrossOriginResourceSharing(request, response);
  if (!corsResult.isNecessaryMainProcessing) {
    return;
  }
  switch (request.path) {
    case "/requestLogInUrl": {
      const binary = new Uint8Array(request.body as Buffer);
      const requestData = common.data.decodeCustomRequestLogInUrlRequestData(
        0,
        binary
      ).result;
      response.send(
        "やったぜ. データを受け取った data = " + JSON.stringify(requestData)
      );
    }
  }
  response.send("想定外の入力を受けた request.path=" + request.path);
});

/**
 * CrossOriginResourceSharing の 処理をする
 */
const supportCrossOriginResourceSharing = (
  request: functions.https.Request,
  response: functions.Response
): { isNecessaryMainProcessing: boolean; origin: Origin } => {
  response.setHeader("vary", "Origin");
  const headerOrigin = request.headers["origin"];
  if (typeof headerOrigin === "string") {
    const localHostPort = headerOrigin.match(/http:\/\/localhost:(\d+)/);
    if (localHostPort !== null) {
      const origin: Origin = {
        _: "debugOrigin",
        portNumber: Number.parseInt(localHostPort[1], 10)
      };
      response.setHeader("access-control-allow-origin", headerOrigin);
      if (request.method === "OPTIONS") {
        response.setHeader(
          "access-control-allow-methods",
          "POST, GET, OPTIONS"
        );
        response.setHeader("access-control-allow-headers", "content-type");
        response.status(200).send("");
        return {
          origin,
          isNecessaryMainProcessing: false
        };
      }
      return {
        origin,
        isNecessaryMainProcessing: true
      };
    }
  }
  response.setHeader("access-control-allow-origin", common.origin);
  if (request.method === "OPTIONS") {
    response.setHeader("access-control-allow-methods", "POST, GET, OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type");
    response.status(200).send("");
    return {
      origin: { _: "releaseOrigin" },
      isNecessaryMainProcessing: false
    };
  }
  return {
    origin: { _: "releaseOrigin" },
    isNecessaryMainProcessing: true
  };
};
