import * as apiCodec from "definy-core/source/api";
import * as common from "definy-core";
import * as d from "definy-core/source/data";
import * as functions from "firebase-functions";
import * as genHtml from "./html";
import * as lib from "./lib";
import * as nHtml from "@narumincho/html";

console.log("versions", process.versions);
/*
 * =====================================================================
 *                  html ブラウザが最初にリクエストするところ
 *
 *                       https://definy.app/
 *    https://definy.app/project/077bc302f933bd78e20efd6fd3fa657e
 *                             など
 *            ↓ Firebase Hosting firebase.json rewrite
 *                Cloud Functions for Firebase / html
 * =====================================================================
 */

export const html = functions.https.onRequest(async (request, response) => {
  const requestUrl = new URL(
    "https://" + request.hostname + request.originalUrl
  );
  const urlData = common.urlDataAndAccountTokenFromUrl(requestUrl).urlData;
  const normalizedUrl = common.urlDataAndAccountTokenToUrl(
    urlData,
    d.Maybe.Nothing()
  );
  console.log("requestUrl", requestUrl.toString());
  console.log("normalizedUrl", normalizedUrl.toString());
  if (requestUrl.toString() !== normalizedUrl.toString()) {
    response.redirect(301, normalizedUrl.toString());
    return;
  }
  const htmlAndIsNotFound = await genHtml.html(urlData, normalizedUrl);

  response.status(htmlAndIsNotFound.isNotFound ? 404 : 200);
  response.setHeader("content-type", "text/html");
  response.send(nHtml.toString(htmlAndIsNotFound.html));
});

/*
 * =====================================================================
 *               api データを取得したり変更したりする
 *              https://definy.app/api/getProject
 *                            など
 *            ↓ Firebase Hosting firebase.json rewrite
 *                Cloud Functions for Firebase / api
 * =====================================================================
 */
export const api = functions
  .runWith({ memory: "512MB" })
  .https.onRequest(async (request, response) => {
    if (supportCrossOriginResourceSharing(request, response)) {
      return;
    }
    const path = request.path.split("/")[2];
    console.log("call api function!", request.connection.remoteAddress, path);
    const result = await callApiFunction(path, request.body as Buffer);
    if (result === undefined) {
      response.status(400);
      response.send("想定外のパスを受けとった request.path=" + request.path);
      return;
    }
    response.send(Buffer.from(result));
  });

const callApiFromCodecAndFunction = <Request, Response>(
  binary: Uint8Array,
  codec: apiCodec.ApiCodec<Request, Response>,
  func: (request: Request) => Promise<Response>
): Promise<ReadonlyArray<number>> =>
  func(codec.request.decode(0, binary).result).then((response) =>
    codec.response.encode(response)
  );

const callApiFunction = (
  path: string,
  binary: Uint8Array
): Promise<ReadonlyArray<number> | undefined> => {
  switch (path) {
    case "requestLogInUrl": {
      return callApiFromCodecAndFunction(
        binary,
        apiCodec.requestLogInUrl,
        lib.requestLogInUrl
      );
    }
    case "getUserByAccountToken": {
      return callApiFromCodecAndFunction(
        binary,
        apiCodec.getUserByAccountToken,
        lib.getUserByAccountToken
      );
    }
    case "getUser": {
      return callApiFromCodecAndFunction(binary, apiCodec.getUser, lib.getUser);
    }
    case "getImageFile": {
      return callApiFromCodecAndFunction(
        binary,
        apiCodec.getImageFile,
        lib.getFile
      );
    }
    case "createProject": {
      return callApiFromCodecAndFunction(
        binary,
        apiCodec.createProject,
        lib.createProject
      );
    }
    case "getTop50Project": {
      return callApiFromCodecAndFunction(
        binary,
        apiCodec.getTop50Project,
        lib.getTop50Project
      );
    }
    case "getProject": {
      return callApiFromCodecAndFunction(
        binary,
        apiCodec.getProject,
        lib.getProject
      );
    }
    case "getTypePartByProjectId": {
      return callApiFromCodecAndFunction(
        binary,
        apiCodec.getTypePartByProjectId,
        lib.getTypePartByProjectId
      );
    }
    case "addTypePart": {
      return callApiFromCodecAndFunction(
        binary,
        apiCodec.addTypePart,
        lib.addTypePart
      );
    }
  }
  return Promise.resolve(undefined);
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
    allowOrigin(request.headers.origin)
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
    httpHeaderOrigin === common.debugOrigin ||
    httpHeaderOrigin === common.releaseOrigin
  ) {
    return httpHeaderOrigin;
  }
  return common.releaseOrigin;
};

/*
 * =====================================================================
 *               logInCallback ソーシャルログインのコールバック先
 *        https://definy.app/logInCallback/Google?state=&code=
 *                            など
 *            ↓ Firebase Hosting firebase.json rewrite
 *                Cloud Functions for Firebase / logInCallback
 * =====================================================================
 */
export const logInCallback = functions.https.onRequest((request, response) => {
  const openIdConnectProvider = request.path.split("/")[2];
  const code: unknown = request.query.code;
  const state: unknown = request.query.state;
  if (!(typeof code === "string" && typeof state === "string")) {
    console.log("codeかstateが送られて来なかった。ユーザーがキャンセルした?");
    response.redirect(
      301,
      common
        .urlDataAndAccountTokenToUrl(
          {
            clientMode: "Release",
            location: d.Location.Home,
            language: common.defaultLanguage,
          },
          d.Maybe.Nothing()
        )
        .toString()
    );
    return;
  }
  switch (openIdConnectProvider) {
    case "Google":
    case "GitHub": {
      lib.logInCallback(openIdConnectProvider, code, state).then((result) => {
        response.redirect(
          301,
          common
            .urlDataAndAccountTokenToUrl(
              result.urlData,
              d.Maybe.Just(result.accessToken)
            )
            .toString()
        );
      });
      return;
    }
    default:
      response.send("invalid OpenIdConnectProvider name =" + request.path);
  }
});

export const getFile = functions.https.onRequest((request, response) => {
  if (supportCrossOriginResourceSharing(request, response)) {
    return;
  }
  lib
    .getReadableStream(request.path.split("/")[1] as d.ImageToken)
    .pipe(response);
});
