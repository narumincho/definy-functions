import * as common from "definy-core";
import * as data from "definy-core/source/data";
import * as functions from "firebase-functions";
import * as genHtml from "./html";
import * as lib from "./lib";
import * as nHtml from "@narumincho/html";

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
  response.send(nHtml.toString(await genHtml.html(urlData, normalizedUrl)));
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
    const result = await callApiFunction(
      request.path.split("/")[2],
      request.body as Buffer
    );
    if (result === undefined) {
      response.status(400);
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
    case "getUserByAccountToken": {
      return data.Maybe.codec(
        data.IdAndData.codec(
          data.UserId.codec,
          data.Resource.codec(data.User.codec)
        )
      ).encode(
        await lib.getUserByAccountToken(
          data.AccountToken.codec.decode(0, binary).result
        )
      );
    }
    case "getUser": {
      const userResource = await lib.getUser(
        data.UserId.codec.decode(0, binary).result
      );
      return data.Resource.codec(data.User.codec).encode(userResource);
    }
    case "getImageFile": {
      const imageBinary = await lib.getFile(
        data.ImageToken.codec.decode(0, binary).result
      );
      return data.Maybe.codec(data.Binary.codec).encode(imageBinary);
    }
    case "createProject": {
      const createProjectParameter = data.CreateProjectParameter.codec.decode(
        0,
        binary
      ).result;
      const newProject = await lib.createProject(
        createProjectParameter.accountToken,
        createProjectParameter.projectName
      );
      return data.Maybe.codec(
        data.IdAndData.codec(
          data.ProjectId.codec,
          data.Resource.codec(data.Project.codec)
        )
      ).encode(newProject);
    }
    case "getTop50Project": {
      return data.List.codec(
        data.IdAndData.codec(
          data.ProjectId.codec,
          data.Resource.codec(data.Project.codec)
        )
      ).encode(await lib.getTop50Project());
    }
    case "getProject": {
      const projectId = data.ProjectId.codec.decode(0, binary).result;
      const projectMaybe = await lib.getProject(projectId);
      return data.Resource.codec(data.Project.codec).encode(projectMaybe);
    }
    case "getIdea": {
      const ideaId = data.IdeaId.codec.decode(0, binary).result;
      const ideaMaybe = await lib.getIdea(ideaId);
      return data.Resource.codec(data.Idea.codec).encode(ideaMaybe);
    }
    case "getIdeaAndIdListByProjectId": {
      const projectId = data.ProjectId.codec.decode(0, binary).result;
      const ideaSnapshotAndIdList = await lib.getIdeaSnapshotAndIdListByProjectId(
        projectId
      );
      return data.List.codec(
        data.IdAndData.codec(
          data.IdeaId.codec,
          data.Resource.codec(data.Idea.codec)
        )
      ).encode(ideaSnapshotAndIdList);
    }
    case "getIdeaByParentIdeaId": {
      const ideaId = data.IdeaId.codec.decode(0, binary).result;
      const ideaList = await lib.getIdeaByParentIdeaId(ideaId);
      return data.List.codec(
        data.IdAndData.codec(
          data.IdeaId.codec,
          data.Resource.codec(data.Idea.codec)
        )
      ).encode(ideaList);
    }
    case "createIdea": {
      const createIdeaParameter = data.CreateIdeaParameter.codec.decode(
        0,
        binary
      ).result;
      const ideaSnapshotAndIdMaybe = await lib.createIdea(createIdeaParameter);
      return data.Maybe.codec(
        data.IdAndData.codec(
          data.IdeaId.codec,
          data.Resource.codec(data.Idea.codec)
        )
      ).encode(ideaSnapshotAndIdMaybe);
    }
    case "addComment": {
      const addCommentParameter = data.AddCommentParameter.codec.decode(
        0,
        binary
      ).result;
      const ideaSnapshotMaybe = await lib.addComment(addCommentParameter);
      return data.Maybe.codec(data.Resource.codec(data.Idea.codec)).encode(
        ideaSnapshotMaybe
      );
    }
    case "getCommit": {
      const suggestionId = data.CommitId.codec.decode(0, binary).result;
      const suggestionMaybe = await lib.getCommit(suggestionId);
      return data.Resource.codec(data.Commit.codec).encode(suggestionMaybe);
    }
    case "getTypePartByProjectId": {
      const projectId = data.ProjectId.codec.decode(0, binary).result;
      const result = await lib.getTypePartByProjectId(projectId);
      return data.Resource.codec(
        data.List.codec(
          data.IdAndData.codec(data.TypePartHash.codec, data.TypePart.codec)
        )
      ).encode(result);
    }
    case "addTypePart": {
      return data.Resource.codec(
        data.List.codec(
          data.IdAndData.codec(data.TypePartHash.codec, data.TypePart.codec)
        )
      ).encode(
        await lib.addTypePart(
          data.AccountTokenAndProjectId.codec.decode(0, binary).result
        )
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
            .urlDataAndAccountTokenToUrl(
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

export const getFile = functions.https.onRequest((request, response) => {
  if (supportCrossOriginResourceSharing(request, response)) {
    return;
  }
  lib
    .getReadableStream(request.path.split("/")[1] as data.ImageToken)
    .pipe(response);
});
