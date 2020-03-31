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
  const requestUrl = new URL(
    "https://" + request.hostname + request.originalUrl
  );
  const urlData: common.data.UrlData = common.urlDataFromUrl(requestUrl);
  const normalizedUrl = common.urlDataToUrl(urlData);
  console.log("requestUrl", requestUrl.toString());
  console.log("normalizedUrl", normalizedUrl.toString());
  if (requestUrl.toString() !== normalizedUrl.toString()) {
    response.redirect(301, normalizedUrl.toString());
    return;
  }
  response.status(200);
  response.setHeader("content-type", "text/html");
  response.send(
    html.toString({
      appName: "Definy",
      pageName: "Definy",
      iconPath: ["icon"],
      coverImageUrl: new URL((common.releaseOrigin as string) + "/icon"),
      description: description(urlData.language, urlData.location),
      scriptUrlList: [new URL((common.releaseOrigin as string) + "/main.js")],
      styleUrlList: [],
      javaScriptMustBeAvailable: true,
      twitterCard: html.TwitterCard.SummaryCard,
      language: html.Language.Japanese,
      manifestPath: ["manifest.json"],
      url: new URL(normalizedUrl.toString()),
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
    case "CreateProject":
      return "Project creation page";
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
    case "CreateProject":
      return "プロジェクト作成ページ";
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
    case "CreateProject":
      return "Projekto kreo de paĝo";
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
  const result = await callApiFunction(
    request.path.split("/")[1],
    request.body as Buffer
  );
  switch (result._) {
    case "Just":
      response.send(Buffer.from(result.value));
      return;
    case "Nothing":
      response.send("想定外のパスを受けとった request.path=" + request.path);
      return;
  }
});

const callApiFunction = async (
  path: string,
  binary: Uint8Array
): Promise<common.data.Maybe<ReadonlyArray<number>>> => {
  switch (path) {
    case "requestLogInUrl": {
      const requestData = common.data.decodeRequestLogInUrlRequestData(
        0,
        binary
      ).result;
      const url = await lib.requestLogInUrl(requestData);
      return common.data.maybeJust(common.data.encodeString(url.toString()));
    }
    case "getUserByAccessToken": {
      return common.data.maybeJust(
        common.data.encodeMaybe(common.data.encodeUserAndUserId)(
          await lib.getUserByAccessToken(
            common.data.decodeToken(0, binary).result as common.data.AccessToken
          )
        )
      );
    }
    case "getUser": {
      const userData = await lib.getUserData(
        common.data.decodeId(0, binary).result as common.data.UserId
      );
      return common.data.maybeJust(
        common.data.encodeMaybe(common.data.encodeUser)(userData)
      );
    }
    case "getImageFile": {
      const imageBinary = await lib.getFile(
        common.data.decodeToken(0, binary).result as common.data.FileHash
      );
      return common.data.maybeJust(common.data.encodeBinary(imageBinary));
    }
    case "createProject": {
      const createProjectParameter = common.data.decodeCreateProjectParameter(
        0,
        binary
      ).result;
      const newProject = await lib.createProject(
        createProjectParameter.accessToken,
        createProjectParameter.projectName
      );
      return common.data.maybeJust(
        common.data.encodeMaybe(common.data.encodeProject)(newProject)
      );
    }
  }

  return common.data.maybeNothing();
};

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
    httpHeaderOrigin.startsWith("http://[::1]")
  ) {
    return httpHeaderOrigin;
  }
  return common.releaseOrigin;
};

export const logInCallback = functions.https.onRequest((request, response) => {
  console.log(request);
  const openIdConnectProvider = request.path.substring(1);
  const code: string | undefined = request.query.code;
  const state: string | undefined = request.query.state;
  if (code === undefined || state === undefined) {
    console.log("codeかstateが送られて来なかった。ユーザーがキャンセルした?");
    response.redirect(
      301,
      common
        .urlDataToUrl({
          clientMode: common.data.clientModeRelease,
          location: common.data.locationHome,
          language: "English",
          accessToken: common.data.maybeNothing()
        })
        .toString()
    );
    return;
  }
  switch (openIdConnectProvider) {
    case "Google":
    case "GitHub": {
      lib.logInCallback(openIdConnectProvider, code, state).then(result => {
        response.redirect(301, common.urlDataToUrl(result).toString());
      });
      return;
    }
    default:
      response.send("invalid OpenIdConnectProvider name =" + request.path);
  }
});

export const getFile = functions.https.onRequest(async (request, response) => {
  if (supportCrossOriginResourceSharing(request, response)) {
    return;
  }
  lib
    .getReadableStream(request.path.split("/")[1] as common.data.FileHash)
    .pipe(response);
});
