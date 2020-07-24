import * as common from "definy-core";
import * as functions from "firebase-functions";
import * as html from "@narumincho/html";
import * as lib from "./lib";
import {
  AccessToken,
  AddCommentParameter,
  Binary,
  Commit,
  CommitId,
  CreateIdeaParameter,
  CreateProjectParameter,
  IdAndData,
  Idea,
  IdeaId,
  ImageToken,
  Language,
  List,
  Location,
  Maybe,
  Project,
  ProjectId,
  RequestLogInUrlRequestData,
  Resource,
  String,
  User,
  UserId,
} from "definy-core/source/data";
import { URL } from "url";

/*
 * =====================================================================
 *               Index Html ブラウザが最初にリクエストするところ
 *
 *          https://definy-lang.web.app/ など
 *              ↓ firebase.json rewrite
 *          Cloud Functions for Firebase / indexHtml
 * =====================================================================
 */

export const indexHtml = functions.https.onRequest(
  async (request, response) => {
    const requestUrl = new URL(
      "https://" + request.hostname + request.originalUrl
    );
    const urlData = common.urlDataAndAccessTokenFromUrl(requestUrl).urlData;
    const normalizedUrl = common.urlDataAndAccessTokenToUrl(
      urlData,
      Maybe.Nothing()
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
        coverImageUrl: await coverImageUrl(urlData.location),
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
  }
);

const coverImageUrl = async (location: Location): Promise<URL> => {
  switch (location._) {
    case "Project": {
      const projectResource = await lib.getProject(location.projectId);
      if (projectResource.dataMaybe._ === "Just") {
        return new URL(
          "https://us-central1-definy-lang.cloudfunctions.net/getFile/" +
            (projectResource.dataMaybe.value.imageHash as string)
        );
      }
    }
  }
  return new URL((common.releaseOrigin as string) + "/icon");
};

const loadingMessage = (language: Language): string => {
  switch (language) {
    case "English":
      return "Loading Definy ...";
    case "Japanese":
      return "Definyを読込中……";
    case "Esperanto":
      return "Ŝarĝante Definy ...";
  }
};

const description = (language: Language, location: Location): string => {
  switch (language) {
    case "English":
      return englishDescription(location);
    case "Japanese":
      return japaneseDescription(location);
    case "Esperanto":
      return esperantoDescription(location);
  }
};

const englishDescription = (location: Location): string => {
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
    case "Commit":
      return "commit page id=" + (location.commitId as string);
    case "Setting":
      return "setting page";
    case "About":
      return "About";
    case "Debug":
      return "Debug";
  }
};

const japaneseDescription = (location: Location): string => {
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
    case "Commit":
      return "提案 id=" + (location.commitId as string);
    case "Setting":
      return "設定ページ";
    case "About":
      return "Definyについて";
    case "Debug":
      return "Debugページ";
  }
};

const esperantoDescription = (location: Location): string => {
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
    case "Commit":
      return "Kompromitipaĝo id=" + (location.commitId as string);
    case "Setting":
      return "Agordoj paĝo";
    case "About":
      return "pri paĝo";
    case "Debug":
      return "elpurigi paĝo";
  }
};

/*
 * =====================================================================
 *               Api データを取得したり変更したりする
 *    https://us-central1-definy-lang.cloudfunctions.net/api
 * =====================================================================
 */
export const api = functions
  .runWith({ memory: "512MB" })
  .https.onRequest(async (request, response) => {
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
      return String.codec.encode("ok");
    }
    case "requestLogInUrl": {
      const requestData = RequestLogInUrlRequestData.codec.decode(0, binary)
        .result;
      const url = await lib.requestLogInUrl(requestData);
      return String.codec.encode(url.toString());
    }
    case "getUserByAccessToken": {
      return Maybe.codec(
        IdAndData.codec(UserId.codec, Resource.codec(User.codec))
      ).encode(
        await lib.getUserByAccessToken(
          AccessToken.codec.decode(0, binary).result
        )
      );
    }
    case "getUser": {
      const userResource = await lib.getUser(
        UserId.codec.decode(0, binary).result
      );
      return Resource.codec(User.codec).encode(userResource);
    }
    case "getImageFile": {
      const imageBinary = await lib.getFile(
        ImageToken.codec.decode(0, binary).result
      );
      return Maybe.codec(Binary.codec).encode(imageBinary);
    }
    case "createProject": {
      const createProjectParameter = CreateProjectParameter.codec.decode(
        0,
        binary
      ).result;
      const newProject = await lib.createProject(
        createProjectParameter.accessToken,
        createProjectParameter.projectName
      );
      return Maybe.codec(
        IdAndData.codec(ProjectId.codec, Resource.codec(Project.codec))
      ).encode(newProject);
    }
    case "getAllProject": {
      return List.codec(
        IdAndData.codec(ProjectId.codec, Resource.codec(Project.codec))
      ).encode(await lib.getTop50Project());
    }
    case "getProject": {
      const projectId = ProjectId.codec.decode(0, binary).result;
      const projectMaybe = await lib.getProject(projectId);
      return Resource.codec(Project.codec).encode(projectMaybe);
    }
    case "getIdea": {
      const ideaId = IdeaId.codec.decode(0, binary).result;
      const ideaMaybe = await lib.getIdea(ideaId);
      return Resource.codec(Idea.codec).encode(ideaMaybe);
    }
    case "getIdeaAndIdListByProjectId": {
      const projectId = ProjectId.codec.decode(0, binary).result;
      const ideaSnapshotAndIdList = await lib.getIdeaSnapshotAndIdListByProjectId(
        projectId
      );
      return List.codec(
        IdAndData.codec(IdeaId.codec, Resource.codec(Idea.codec))
      ).encode(ideaSnapshotAndIdList);
    }
    case "createIdea": {
      const createIdeaParameter = CreateIdeaParameter.codec.decode(0, binary)
        .result;
      const ideaSnapshotAndIdMaybe = await lib.createIdea(createIdeaParameter);
      return Maybe.codec(
        IdAndData.codec(IdeaId.codec, Resource.codec(Idea.codec))
      ).encode(ideaSnapshotAndIdMaybe);
    }
    case "addComment": {
      const addCommentParameter = AddCommentParameter.codec.decode(0, binary)
        .result;
      const ideaSnapshotMaybe = await lib.addComment(addCommentParameter);
      return Maybe.codec(Resource.codec(Idea.codec)).encode(ideaSnapshotMaybe);
    }
    case "getCommit": {
      const suggestionId = CommitId.codec.decode(0, binary).result;
      const suggestionMaybe = await lib.getCommit(suggestionId);
      return Resource.codec(Commit.codec).encode(suggestionMaybe);
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
            location: Location.Home,
            language: common.defaultLanguage,
          },
          Maybe.Nothing()
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
              Maybe.Just(result.accessToken)
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
    .getReadableStream(request.path.split("/")[1] as ImageToken)
    .pipe(response);
});
