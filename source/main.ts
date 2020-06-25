import * as functions from "firebase-functions";
import * as html from "@narumincho/html";
import { URL } from "url";
import * as common from "definy-common";
import { data } from "definy-common";
import * as lib from "./lib";
import { spawnSync } from "child_process";

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
  const urlData = common.urlDataAndAccessTokenFromUrl(requestUrl).urlData;
  const normalizedUrl = common.urlDataAndAccessTokenToUrl(
    urlData,
    data.Maybe.Nothing()
  );
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
      body: [html.div({}, loadingMessage(urlData.language))],
    })
  );
});

const loadingMessage = (language: data.Language): string => {
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
  language: data.Language,
  location: data.Location
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

const englishDescription = (location: data.Location): string => {
  switch (location._) {
    case "Home":
      return "Definy is Web App for Web App.";
    case "CreateProject":
      return "Project creation page";
    case "Project":
      return "Project page id=" + (location.projectId as string);
    case "User":
      return "User page id=" + (location.userId as string);
    case "Idea":
      return "Idea page id=" + (location.ideaId as string);
    case "Suggestion":
      return "suggestion page id=" + (location.suggestionId as string);
    case "About":
      return "About";
    case "Debug":
      return "Debug";
  }
};

const japaneseDescription = (location: data.Location): string => {
  switch (location._) {
    case "Home":
      return "ブラウザで動作する革新的なプログラミング言語!";
    case "CreateProject":
      return "プロジェクト作成ページ";
    case "Project":
      return "プロジェクト id=" + (location.projectId as string);
    case "User":
      return "ユーザー id=" + (location.userId as string);
    case "Idea":
      return "アイデア id=" + (location.ideaId as string);
    case "Suggestion":
      return "提案 id=" + (location.suggestionId as string);
    case "About":
      return "Definyについて";
    case "Debug":
      return "Debugページ";
  }
};

const esperantoDescription = (location: data.Location): string => {
  switch (location._) {
    case "Home":
      return "Noviga programlingvo, kiu funkcias en la retumilo";
    case "CreateProject":
      return "Projekto kreo de paĝo";
    case "Project":
      return "projektopaĝo id=" + (location.projectId as string);
    case "User":
      return "uzantopaĝo id=" + (location.userId as string);
    case "Idea":
      return "Ideopaĝo id=" + (location.ideaId as string);
    case "Suggestion":
      return "sugestapaĝo id=" + (location.suggestionId as string);
    case "About":
      return "pri paĝo";
    case "Debug":
      return "elpurigi paĝo";
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
  if (result === undefined) {
    response.send("想定外のパスを受けとった request.path=" + request.path);
    return;
  }
  response.send(Buffer.from(result));
});

const callApiFunction = async (
  path: string,
  binary: Uint8Array
): Promise<ReadonlyArray<number> | undefined> => {
  switch (path) {
    case "checkConnection": {
      return data.String.codec.encode("ok");
    }
    case "requestLogInUrl": {
      const requestData = data.RequestLogInUrlRequestData.codec.decode(
        0,
        binary
      ).result;
      const url = await lib.requestLogInUrl(requestData);
      return data.String.codec.encode(url.toString());
    }
    case "getUserByAccessToken": {
      return data.Maybe.codec(
        data.IdAndData.codec(data.UserId.codec, data.User.codec)
      ).encode(
        await lib.getUserByAccessToken(
          data.AccessToken.codec.decode(0, binary).result
        )
      );
    }
    case "getUser": {
      const userData = await lib.getUserSnapshot(
        data.UserId.codec.decode(0, binary).result
      );
      return data.Maybe.codec(data.User.codec).encode(userData);
    }
    case "getImageFile": {
      const imageBinary = await lib.getFile(
        data.ImageToken.codec.decode(0, binary).result
      );
      return data.Binary.codec.encode(imageBinary);
    }
    case "createProject": {
      const createProjectParameter = data.CreateProjectParameter.codec.decode(
        0,
        binary
      ).result;
      const newProject = await lib.createProject(
        createProjectParameter.accessToken,
        createProjectParameter.projectName
      );
      return data.Maybe.codec(
        data.IdAndData.codec(data.ProjectId.codec, data.Project.codec)
      ).encode(newProject);
    }
    case "getAllProjectId": {
      return data.List.codec(data.ProjectId.codec).encode(
        await lib.getAllProjectId()
      );
    }
    case "getAllProject": {
      return data.List.codec(
        data.IdAndData.codec(data.ProjectId.codec, data.Project.codec)
      ).encode(await lib.getAllProjectSnapshot());
    }
    case "getProject": {
      const projectId = data.ProjectId.codec.decode(0, binary).result;
      const projectMaybe = await lib.getProjectSnapshot(projectId);
      return data.Maybe.codec(data.Project.codec).encode(projectMaybe);
    }
    case "getIdea": {
      const ideaId = data.IdeaId.codec.decode(0, binary).result;
      const ideaMaybe = await lib.getIdea(ideaId);
      return data.Maybe.codec(data.Idea.codec).encode(ideaMaybe);
    }
    case "getIdeaAndIdListByProjectId": {
      const projectId = data.ProjectId.codec.decode(0, binary).result;
      const ideaSnapshotAndIdList = await lib.getIdeaSnapshotAndIdListByProjectId(
        projectId
      );
      return data.List.codec(
        data.IdAndData.codec(data.IdeaId.codec, data.Idea.codec)
      ).encode(ideaSnapshotAndIdList);
    }
    case "createIdea": {
      const createIdeaParameter = data.CreateIdeaParameter.codec.decode(
        0,
        binary
      ).result;
      const ideaSnapshotAndIdMaybe = await lib.createIdea(createIdeaParameter);
      return data.Maybe.codec(
        data.IdAndData.codec(data.IdeaId.codec, data.Idea.codec)
      ).encode(ideaSnapshotAndIdMaybe);
    }
    case "addComment": {
      const addCommentParameter = data.AddCommentParameter.codec.decode(
        0,
        binary
      ).result;
      const ideaSnapshotMaybe = await lib.addComment(addCommentParameter);
      return data.Maybe.codec(data.Idea.codec).encode(ideaSnapshotMaybe);
    }
    case "getSuggestion": {
      const suggestionId = data.SuggestionId.codec.decode(0, binary).result;
      const suggestionMaybe = await lib.getSuggestion(suggestionId);
      return data.Maybe.codec(data.Suggestion.codec).encode(suggestionMaybe);
    }
    case "addSuggestion": {
      const addSuggestionParameter = data.AddSuggestionParameter.codec.decode(
        0,
        binary
      ).result;
      const suggestionSnapshotAndIdMaybe = await lib.addSuggestion(
        addSuggestionParameter
      );
      return data.Maybe.codec(
        data.IdAndData.codec(data.SuggestionId.codec, data.Suggestion.codec)
      ).encode(suggestionSnapshotAndIdMaybe);
    }
    case "updateSuggestion": {
      const updateSuggestionParameter = data.UpdateSuggestionParameter.codec.decode(
        0,
        binary
      ).result;
      const suggestionMaybe = await lib.updateSuggestion(
        updateSuggestionParameter
      );
      return data.Maybe.codec(data.Suggestion.codec).encode(suggestionMaybe);
    }
    case "fontList":
      spawnSync("convert", ["-list", "font"]);
      return [];
  }
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
    httpHeaderOrigin === common.debugOrigin ||
    httpHeaderOrigin === common.releaseOrigin
  ) {
    return httpHeaderOrigin;
  }
  return common.releaseOrigin;
};

export const logInCallback = functions.https.onRequest((request, response) => {
  const openIdConnectProvider = request.path.substring(1);
  const code: unknown = request.query.code;
  const state: unknown = request.query.state;
  if (!(typeof code === "string" && typeof state === "string")) {
    console.log("codeかstateが送られて来なかった。ユーザーがキャンセルした?");
    response.redirect(
      301,
      common
        .urlDataAndAccessTokenToUrl(
          {
            clientMode: "Release",
            location: data.Location.Home,
            language: common.defaultLanguage,
          },
          data.Maybe.Nothing()
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
            .urlDataAndAccessTokenToUrl(
              result.urlData,
              data.Maybe.Just(result.accessToken)
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

export const getFile = functions.https.onRequest(async (request, response) => {
  if (supportCrossOriginResourceSharing(request, response)) {
    return;
  }
  lib
    .getReadableStream(request.path.split("/")[1] as data.ImageToken)
    .pipe(response);
});
