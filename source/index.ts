import * as functions from "firebase-functions";
import * as html from "@narumincho/html";
import { URL } from "url";
import * as common from "definy-common";
import * as lib from "./lib";

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
  const urlData: common.data.UrlData = common.urlDataFromUrl(requestUrl);
  const normalizedUrl = common.urlDataToUrl(urlData);
  console.log("requestUrl", requestUrl);
  console.log("normalizedUrl", normalizedUrl);
  if (requestUrl !== normalizedUrl) {
    response.redirect(301, normalizedUrl);
    return;
  }
  response.status(200);
  response.setHeader("content-type", "text/html");
  response.send(
    html.toString({
      appName: "Definy",
      pageName: "Definy",
      iconPath: ["icon"],
      coverImageUrl: new URL(common.releaseOrigin + "/icon.png"),
      description: description(urlData.language, urlData.location),
      scriptUrlList: [new URL(common.releaseOrigin + "/main.js")],
      styleUrlList: [],
      javaScriptMustBeAvailable: true,
      twitterCard: html.TwitterCard.SummaryCard,
      language: html.Language.Japanese,
      manifestPath: ["manifest.json"],
      url: new URL(normalizedUrl),
      style: `/*
      Hack typeface https://github.com/source-foundry/Hack
      License: https://github.com/source-foundry/Hack/blob/master/LICENSE.md
  */

  @font-face {
      font-family: "Hack";
      font-weight: 400;
      font-style: normal;
      src: url("/hack-regular-subset.woff2") format("woff2");
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
      body: [html.div({}, loadingMessage(urlData.language))]
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
  language: common.data.Language,
  location: common.data.Location
): string => {
  switch (language) {
    case "English":
      return englishDescription(location);
    case "Japanese":
      return japaneseDescription(location);
    case "Esperanto":
      return esperantoDescription(location);
  }
};

const englishDescription = (location: common.data.Location): string => {
  switch (location._) {
    case "Home":
      return "Definy is Web App for Web App.";
    case "Project":
      return "Definy Project page id=" + (location.projectId as string);
    case "User":
      return "Definy User page id=" + (location.userId as string);
  }
};

const japaneseDescription = (location: common.data.Location): string => {
  switch (location._) {
    case "Home":
      return "ブラウザで動作する革新的なプログラミング言語!";
    case "Project":
      return "プロジェクト id=" + (location.projectId as string);
    case "User":
      return "ユーザー id=" + (location.userId as string);
  }
};

const esperantoDescription = (location: common.data.Location): string => {
  switch (location._) {
    case "Home":
      return "Noviga programlingvo, kiu funkcias en la retumilo";
    case "Project":
      return "projektopaĝo id=" + (location.projectId as string);
    case "User":
      return "uzantopaĝo id=" + (location.userId as string);
  }
};

/* =====================================================================
 *               Api データを取得したり変更したりする
 *    https://us-central1-definy-lang.cloudfunctions.net/api
 * =====================================================================
 */
export const api = functions.https.onRequest(async (request, response) => {
  if (supportCrossOriginResourceSharing(request, response)) {
    return;
  }
  switch (request.path) {
    case "/requestLogInUrl": {
      const binary = new Uint8Array(request.body as Buffer);
      const requestData = common.data.decodeRequestLogInUrlRequestData(
        0,
        binary
      ).result;
      const url = await lib.requestLogInUrl(requestData);
      response.send(Buffer.from(common.data.encodeString(url.toString())));
      return;
    }
  }
  response.send("想定外の入力を受けた request.path=" + request.path);
});

/**
 * CrossOriginResourceSharing の 処理をする.
 * @returns true → メインの処理をしなくていい, false → メインの処理をする必要がある
 */
const supportCrossOriginResourceSharing = (
  request: functions.https.Request,
  response: functions.Response
): boolean => {
  response.setHeader("vary", "Origin");
  response.setHeader(
    "access-control-allow-origin",
    allowOrigin(request.headers["origin"])
  );
  if (request.method === "OPTIONS") {
    response.setHeader("access-control-allow-methods", "POST, GET, OPTIONS");
    response.setHeader("access-control-allow-headers", "content-type");
    response.status(200).send("");
    return true;
  }
  return false;
};

const allowOrigin = (httpHeaderOrigin: unknown): string => {
  if (
    typeof httpHeaderOrigin === "string" &&
    /^http:\/\/localhost:\d+$/.test(httpHeaderOrigin)
  ) {
    return httpHeaderOrigin;
  }
  return common.releaseOrigin;
};

export const logInCallback = functions.https.onRequest((request, response) => {
  console.log(request);
  response.send("ok");
});
