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
  const urlData = common.urlDataAndAccessTokenFromUrl(requestUrl).urlData;
  const normalizedUrl = common.urlDataAndAccessTokenToUrl(
    urlData,
    common.data.maybeNothing()
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
    case "CreateProject":
      return "Project creation page";
    case "CreateIdea":
      return "Idea creation page. projectId=" + (location.projectId as string);
    case "Project":
      return "Project page id=" + (location.projectId as string);
    case "User":
      return "User page id=" + (location.userId as string);
    case "UserList":
      return "UserList page";
    case "Idea":
      return "Idea page id=" + (location.ideaId as string);
    case "Suggestion":
      return "suggestion page id=" + (location.suggestionId as string);
    case "PartList":
      return "Part list page";
    case "TypePartList":
      return "TypePart List page";
    case "About":
      return "About";
  }
};

const japaneseDescription = (location: common.data.Location): string => {
  switch (location._) {
    case "Home":
      return "ブラウザで動作する革新的なプログラミング言語!";
    case "CreateProject":
      return "プロジェクト作成ページ";
    case "CreateIdea":
      return "アイデアの作成ページ";
    case "Project":
      return "プロジェクト id=" + (location.projectId as string);
    case "User":
      return "ユーザー id=" + (location.userId as string);
    case "UserList":
      return "ユーザー一覧ページ";
    case "Idea":
      return "アイデア id=" + (location.ideaId as string);
    case "Suggestion":
      return "提案 id=" + (location.suggestionId as string);
    case "PartList":
      return "パーツの一覧ページ";
    case "TypePartList":
      return "型パーツの一覧ページ";
    case "About":
      return "Definyについて";
  }
};

const esperantoDescription = (location: common.data.Location): string => {
  switch (location._) {
    case "Home":
      return "Noviga programlingvo, kiu funkcias en la retumilo";
    case "CreateProject":
      return "Projekto kreo de paĝo";
    case "CreateIdea":
      return "Ideo kreo de paĝo";
    case "Project":
      return "projektopaĝo id=" + (location.projectId as string);
    case "User":
      return "uzantopaĝo id=" + (location.userId as string);
    case "UserList":
      return "Uzantlisto paĝo";
    case "Idea":
      return "Ideopaĝo id=" + (location.ideaId as string);
    case "Suggestion":
      return "sugestapaĝo id=" + (location.suggestionId as string);
    case "PartList":
      return "partolisto paĝo";
    case "TypePartList":
      return "Tajpu parto paĝo";
    case "About":
      return "pri paĝo";
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
    case "requestLogInUrl": {
      const requestData = common.data.decodeRequestLogInUrlRequestData(
        0,
        binary
      ).result;
      const url = await lib.requestLogInUrl(requestData);
      return common.data.encodeString(url.toString());
    }
    case "getUserByAccessToken": {
      return common.data.encodeMaybe(common.data.encodeUserSnapshotAndId)(
        await lib.getUserByAccessToken(
          common.data.decodeToken(0, binary).result as common.data.AccessToken
        )
      );
    }
    case "getUser": {
      const userData = await lib.getUserSnapshot(
        common.data.decodeId(0, binary).result as common.data.UserId
      );
      return common.data.encodeMaybe(common.data.encodeUserSnapshot)(userData);
    }
    case "getImageFile": {
      const imageBinary = await lib.getFile(
        common.data.decodeToken(0, binary).result as common.data.ImageToken
      );
      return common.data.encodeBinary(imageBinary);
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
      return common.data.encodeMaybe(common.data.encodeProjectSnapshotAndId)(
        newProject
      );
    }
    case "getAllProjectId": {
      const projectIdList = await lib.getAllProjectId();
      return common.data.encodeList(common.data.encodeId)(projectIdList);
    }
    case "getProject": {
      const projectId = common.data.decodeId(0, binary)
        .result as common.data.ProjectId;
      const projectMaybe = await lib.getProjectSnapshot(projectId);
      return common.data.encodeMaybe(common.data.encodeProjectSnapshot)(
        projectMaybe
      );
    }
    case "getIdea": {
      const ideaId = common.data.decodeId(0, binary)
        .result as common.data.IdeaId;
      const ideaMaybe = await lib.getIdea(ideaId);
      return common.data.encodeMaybe(common.data.encodeIdeaSnapshot)(ideaMaybe);
    }
    case "getIdeaAndIdListByProjectId": {
      const projectId = common.data.decodeId(0, binary)
        .result as common.data.ProjectId;
      const ideaSnapshotAndIdList = await lib.getIdeaSnapshotAndIdListByProjectId(
        projectId
      );
      return common.data.encodeList(common.data.encodeIdeaSnapshotAndId)(
        ideaSnapshotAndIdList
      );
    }
    case "createIdea": {
      const createIdeaParameter = common.data.decodeCreateIdeaParameter(
        0,
        binary
      ).result;
      const ideaSnapshotAndIdMaybe = await lib.createIdea(createIdeaParameter);
      return common.data.encodeMaybe(common.data.encodeIdeaSnapshotAndId)(
        ideaSnapshotAndIdMaybe
      );
    }
    case "addComment": {
      const addCommentParameter = common.data.decodeAddCommentParameter(
        0,
        binary
      ).result;
      const ideaSnapshotMaybe = await lib.addComment(addCommentParameter);
      return common.data.encodeMaybe(common.data.encodeIdeaSnapshot)(
        ideaSnapshotMaybe
      );
    }
    case "getSuggestion": {
      const suggestionId = common.data.decodeId(0, binary)
        .result as common.data.SuggestionId;
      const suggestionMaybe = await lib.getSuggestion(suggestionId);
      return common.data.encodeMaybe(common.data.encodeSuggestionSnapshot)(
        suggestionMaybe
      );
    }
    case "addSuggestion": {
      const addSuggestionParameter = common.data.decodeAddSuggestionParameter(
        0,
        binary
      ).result;
      const suggestionSnapshotAndIdMaybe = await lib.addSuggestion(
        addSuggestionParameter
      );
      return common.data.encodeMaybe(common.data.encodeSuggestionSnapshotAndId)(
        suggestionSnapshotAndIdMaybe
      );
    }
    case "updateSuggestion": {
      const updateSuggestionParameter = common.data.decodeUpdateSuggestionParameter(
        0,
        binary
      ).result;
      const suggestionMaybe = await lib.updateSuggestion(
        updateSuggestionParameter
      );
      return common.data.encodeMaybe(common.data.encodeSuggestionSnapshot)(
        suggestionMaybe
      );
    }
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
            location: common.data.locationHome,
            language: common.defaultLanguage,
          },
          common.data.maybeNothing()
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
              common.data.maybeJust(result.accessToken)
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
    .getReadableStream(request.path.split("/")[1] as common.data.ImageToken)
    .pipe(response);
});
