import * as admin from "firebase-admin";
import * as common from "definy-core";
import * as crypto from "crypto";
import * as data from "definy-core/source/data";
import * as functions from "firebase-functions";
import * as image from "./image";
import * as jimp from "jimp";
import * as jsonWebToken from "jsonwebtoken";
import * as stream from "stream";
import * as tokenize from "./tokenize";
import type * as typedFirestore from "typed-admin-firestore";
import * as util from "definy-core/source/util";
import axios, { AxiosResponse } from "axios";
import { URL } from "url";

const app = admin.initializeApp();

type AccessTokenHash = string & { _accessTokenHash: never };

const storageDefaultBucket = app.storage().bucket();
const database = (app.firestore() as unknown) as typedFirestore.Firestore<{
  openConnectState: {
    key: string;
    value: StateData;
    subCollections: Record<never, never>;
  };
  user: {
    key: data.UserId;
    value: UserData;
    subCollections: Record<never, never>;
  };
  project: {
    key: data.ProjectId;
    value: ProjectData;
    subCollections: Record<never, never>;
  };
  idea: {
    key: data.IdeaId;
    value: IdeaData;
    subCollections: Record<never, never>;
  };
  suggestion: {
    key: data.SuggestionId;
    value: SuggestionData;
    subCollections: Record<never, never>;
  };
  part: {
    key: data.PartId;
    value: PartData;
    subCollections: Record<never, never>;
  };
  typePart: {
    key: data.TypePartId;
    value: TypePartData;
    subCollections: Record<never, never>;
  };
}>;

type StateData = {
  createTime: admin.firestore.Timestamp;
  urlData: data.UrlData;
  provider: data.OpenIdConnectProvider;
};

/**
 * 登録してくれたユーザー
 */
type UserData = {
  /** アクセストークンのハッシュ値 */
  readonly accessTokenHash: AccessTokenHash;
  /** アクセストークンを発行した日時 */
  readonly accessTokenIssueTime: admin.firestore.Timestamp;
  readonly commentedIdeaIdList: ReadonlyArray<data.IdeaId>;
  readonly createdAt: admin.firestore.Timestamp;
  readonly developedProjectIdList: ReadonlyArray<data.ProjectId>;
  readonly imageHash: data.ImageToken;
  readonly introduction: string;
  readonly likedProjectIdList: ReadonlyArray<data.ProjectId>;
  readonly name: string;
  /** ユーザーのログイン */
  readonly openIdConnect: OpenIdConnectProviderAndId;
};

type ProjectData = {
  readonly name: string;
  readonly iconHash: data.ImageToken;
  readonly imageHash: data.ImageToken;
  readonly createTime: admin.firestore.Timestamp;
  readonly updateTime: admin.firestore.Timestamp;
  readonly createUserId: data.UserId;
  readonly partIdList: ReadonlyArray<data.PartId>;
  readonly typePartIdList: ReadonlyArray<data.TypePartId>;
  readonly tagList: ReadonlyArray<string>;
};
/** ソーシャルログインに関する情報 */
type OpenIdConnectProviderAndId = {
  /** プロバイダー (例: Google, GitHub) */
  readonly provider: data.OpenIdConnectProvider;
  /** プロバイダー内でのアカウントID */
  readonly idInProvider: string;
};

type IdeaData = {
  readonly createTime: admin.firestore.Timestamp;
  readonly createUserId: data.UserId;
  readonly itemList: ReadonlyArray<data.IdeaItem>;
  readonly name: string;
  readonly projectId: data.ProjectId;
  readonly tagList: ReadonlyArray<string>;
  readonly updateTime: admin.firestore.Timestamp;
};

type SuggestionData = {
  readonly name: string;
  readonly reason: string;
  readonly createUserId: data.UserId;
  readonly state: data.SuggestionState;
  readonly changeList: ReadonlyArray<data.Change>;
  readonly projectId: data.ProjectId;
  readonly ideaId: data.IdeaId;
  readonly updateTime: admin.firestore.Timestamp;
};

type PartData = {
  /** パーツの名前 */
  name: string;
  /** 説明文 */
  description: string;
  /** 語句.検索用 */
  nounList: ReadonlyArray<string>;
  /** 使用している型.検索用 */
  usedTypeList: ReadonlyArray<string>;
  /** 使用しているパーツ.検索用 */
  usedPartList: ReadonlyArray<string>;
  /** 型 */
  type: data.Type;
  /** 作成元 (必ずしも削除されたパーツからではない) */
  parent: ReadonlyArray<string>;
  /** 移行先 (代用可ではない, 最新リリースで削除された(!=[])) */
  destination: ReadonlyArray<string>;
  /** 最終更新日時 */
  updateTime: admin.firestore.Timestamp;
  /** 影響を受けた提案 */
  suggestionIdList: ReadonlyArray<data.SuggestionId>;
  /** 作成日時 */
  createdAt: admin.firestore.Timestamp;
};

type TypePartData = {
  /** パーツの名前 */
  name: string;
  /** 説明文 */
  description: string;
  /** 属しているモジュール */
  moduleId: string;
  /** 語句.検索用 */
  nounList: ReadonlyArray<string>;
  /** 使用している型.検索用 */
  usedTypeList: ReadonlyArray<string>;
  /** 作成元 (必ずしも削除された型からではない) */
  parent: ReadonlyArray<string>;
  /** 移行先 (代用可ではない, 最新リリースで削除された(!=[])) */
  destination: ReadonlyArray<string>;
  /** 定義本体 */
  type: data.TypePartBody;
  /** 最終更新日時 */
  updateTime: admin.firestore.Timestamp;
  /** 影響を受けた提案 */
  suggestionIdList: ReadonlyArray<data.SuggestionId>;
  /** 作成日時 */
  createdTime: admin.firestore.Timestamp;
};

export const requestLogInUrl = async (
  requestLogInUrlRequestData: data.RequestLogInUrlRequestData
): Promise<URL> => {
  const state = createRandomId();
  await createStateDocument(
    requestLogInUrlRequestData,
    state,
    admin.firestore.Timestamp.now()
  );
  return logInUrlFromOpenIdConnectProviderAndState(
    requestLogInUrlRequestData.openIdConnectProvider,
    state
  );
};

const createStateDocument = async (
  requestLogInUrlRequestData: data.RequestLogInUrlRequestData,
  state: string,
  createdAt: admin.firestore.Timestamp
): Promise<void> => {
  const stateData: StateData = {
    createTime: createdAt,
    urlData: requestLogInUrlRequestData.urlData,
    provider: requestLogInUrlRequestData.openIdConnectProvider,
  };
  await database.collection("openConnectState").doc(state).create(stateData);
};

const logInUrlFromOpenIdConnectProviderAndState = (
  openIdConnectProvider: data.OpenIdConnectProvider,
  state: string
): URL => {
  switch (openIdConnectProvider) {
    case "Google":
      return createUrl(
        "https://accounts.google.com/o/oauth2/v2/auth",
        new Map([
          ["response_type", "code"],
          ["client_id", getOpenIdConnectClientId("Google")],
          ["redirect_uri", logInRedirectUri("Google")],
          ["scope", "profile openid"],
          ["state", state],
        ])
      );
    case "GitHub":
      return createUrl(
        "https://github.com/login/oauth/authorize",
        new Map([
          ["response_type", "code"],
          ["client_id", getOpenIdConnectClientId("GitHub")],
          ["redirect_uri", logInRedirectUri("GitHub")],
          ["scope", "read:user"],
          ["state", state],
        ])
      );
  }
};

const firestoreTimestampToTime = (
  timestamp: admin.firestore.Timestamp
): data.Time => util.timeFromDate(timestamp.toDate());

const createUrl = (
  originAndPath: string,
  query: ReadonlyMap<string, string>
): URL => {
  const url = new URL(originAndPath);
  for (const [key, value] of query) {
    url.searchParams.append(key, value);
  }
  return url;
};

/**
 * Id。各種リソースを識別するために使うID。UUID(v4)やIPv6と同じ128bit, 16bytes
 * 小文字に統一して、大文字は使わない。長さは32文字
 */
const createRandomId = (): string => {
  return crypto.randomBytes(16).toString("hex");
};

const logInRedirectUri = (
  openIdConnectProvider: data.OpenIdConnectProvider
): string =>
  "https://us-central1-definy-lang.cloudfunctions.net/logInCallback/" +
  (openIdConnectProvider as string);

/**
 * OpenIdConnectで外部ログインからの受け取ったデータを元に,ログインする前のURLとアクセストークンを返す
 * @param openIdConnectProvider
 * @param code
 * @param state
 */
export const logInCallback = async (
  openIdConnectProvider: data.OpenIdConnectProvider,
  code: string,
  state: string
): Promise<{ urlData: data.UrlData; accessToken: data.AccessToken }> => {
  const documentReference = database.collection("openConnectState").doc(state);
  const stateData = (await documentReference.get()).data();
  if (stateData === undefined || stateData.provider !== openIdConnectProvider) {
    throw new Error(
      "Definy do not generate state. openIdConnectProvider=" +
        (openIdConnectProvider as string)
    );
  }
  documentReference.delete();
  const providerUserData: ProviderUserData = await getUserDataFromCode(
    openIdConnectProvider,
    code
  );
  const openIdConnectProviderAndIdQuery: OpenIdConnectProviderAndId = {
    idInProvider: providerUserData.id,
    provider: openIdConnectProvider,
  };
  const documentList = (
    await database
      .collection("user")
      .where("openIdConnect", "==", openIdConnectProviderAndIdQuery)
      .get()
  ).docs;
  if (documentList.length === 0) {
    const accessToken = await createUser(
      providerUserData,
      openIdConnectProvider
    );
    return {
      urlData: stateData.urlData,
      accessToken,
    };
  }
  const userQueryDocumentSnapshot = documentList[0];
  const userDocumentReference = userQueryDocumentSnapshot.ref;
  const accessTokenData = issueAccessToken();
  await userDocumentReference.update({
    accessTokenHash: accessTokenData.accessTokenHash,
    accessTokenIssueTime: accessTokenData.issueTime,
  });
  return {
    urlData: stateData.urlData,
    accessToken: accessTokenData.accessToken,
  };
};

type ProviderUserData = {
  id: string;
  name: string;
  imageUrl: URL;
};

const getUserDataFromCode = (
  openIdConnectProvider: data.OpenIdConnectProvider,
  code: string
): Promise<ProviderUserData> => {
  switch (openIdConnectProvider) {
    case "Google":
      return getGoogleUserDataFromCode(code);
    case "GitHub":
      return getGitHubUserDataFromCode(code);
  }
};

const getGoogleUserDataFromCode = async (
  code: string
): Promise<ProviderUserData> => {
  const response = await axios.post(
    "https://www.googleapis.com/oauth2/v4/token",
    new URLSearchParams([
      ["grant_type", "authorization_code"],
      ["code", code],
      ["redirect_uri", logInRedirectUri("Google")],
      ["client_id", getOpenIdConnectClientId("Google")],
      ["client_secret", getOpenIdConnectClientSecret("Google")],
    ]),
    {
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
    }
  );
  const idToken: string = response.data.id_token;
  const decoded = jsonWebToken.decode(idToken);
  if (typeof decoded === "string" || decoded === null) {
    throw new Error("Google idToken not include object");
  }
  const markedDecoded = decoded as {
    iss: unknown;
    sub: unknown;
    name: unknown;
    picture: unknown;
  };
  if (
    markedDecoded.iss !== "https://accounts.google.com" ||
    typeof markedDecoded.name !== "string" ||
    typeof markedDecoded.sub !== "string" ||
    typeof markedDecoded.picture !== "string"
  ) {
    console.error(
      "Googleから送られてきたIDトークンがおかしい" + markedDecoded.toString()
    );
    throw new Error("Google idToken is invalid");
  }

  return {
    id: markedDecoded.sub,
    name: markedDecoded.name,
    imageUrl: new URL(markedDecoded.picture),
  };
};

const getGitHubUserDataFromCode = async (
  code: string
): Promise<ProviderUserData> => {
  const responseData = (
    await axios.post(
      "https://github.com/login/oauth/access_token",
      new URLSearchParams([
        ["grant_type", "authorization_code"],
        ["code", code],
        ["redirect_uri", logInRedirectUri("GitHub")],
        ["client_id", getOpenIdConnectClientId("GitHub")],
        ["client_secret", getOpenIdConnectClientSecret("GitHub")],
      ]),
      {
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
      }
    )
  ).data;
  const accessToken: unknown = responseData.access_token;
  if (typeof accessToken !== "string") {
    console.error("GitHubからアクセストークンを取得できなかった", responseData);
    throw new Error("LogInError: GitHub Oauth response is invalid");
  }

  const gitHubData = (
    await axios.post(
      "https://api.github.com/graphql",
      {
        query: `
query {
viewer {
    id
    name
    avatarUrl
}
}
`,
      },
      {
        headers: {
          Authorization: "token " + accessToken,
        },
      }
    )
  ).data.data.viewer;
  if (
    gitHubData === undefined ||
    gitHubData === null ||
    typeof gitHubData === "string"
  ) {
    throw new Error("LogInError: GitHub API response is invalid");
  }
  const id: unknown = gitHubData.id;
  const name: unknown = gitHubData.name;
  const avatarUrl: unknown = gitHubData.avatarUrl;
  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof avatarUrl !== "string"
  ) {
    throw new Error("LogInError: GitHub API response is invalid");
  }
  return {
    id,
    name,
    imageUrl: new URL(avatarUrl),
  };
};

const createUser = async (
  providerUserData: ProviderUserData,
  provider: data.OpenIdConnectProvider
): Promise<data.AccessToken> => {
  const imageHash = await getAndSaveUserImage(providerUserData.imageUrl);
  const createdAt = admin.firestore.Timestamp.now();
  const accessTokenData = issueAccessToken();
  await database
    .collection("user")
    .doc(createRandomId() as data.UserId)
    .create({
      name: providerUserData.name,
      commentedIdeaIdList: [],
      createdAt,
      developedProjectIdList: [],
      imageHash,
      introduction: "",
      accessTokenHash: accessTokenData.accessTokenHash,
      accessTokenIssueTime: accessTokenData.issueTime,
      likedProjectIdList: [],
      openIdConnect: {
        idInProvider: providerUserData.id,
        provider,
      },
    });
  return accessTokenData.accessToken;
};

const getAndSaveUserImage = async (imageUrl: URL): Promise<data.ImageToken> => {
  const response: AxiosResponse<Buffer> = await axios.get(imageUrl.toString(), {
    responseType: "arraybuffer",
  });
  return savePngFile(
    await (await jimp.create(response.data))
      .resize(64, 64)
      .getBufferAsync("image/ong")
  );
};

/**
 * Firebase Cloud Storage にPNGファイルを保存する
 */
const savePngFile = (buffer: Buffer): Promise<data.ImageToken> =>
  saveFile(buffer, "image/png");

/**
 * Firebase Cloud Storage にファイルを保存する
 */
const saveFile = async (
  buffer: Buffer,
  mimeType: string
): Promise<data.ImageToken> => {
  const hash = createHashFromBuffer(buffer, mimeType);
  const file = storageDefaultBucket.file(hash);
  await file.save(buffer, { contentType: mimeType });
  return hash;
};

export const createHashFromBuffer = (
  buffer: Buffer,
  mimeType: string
): data.ImageToken =>
  crypto
    .createHash("sha256")
    .update(buffer)
    .update(mimeType, "utf8")
    .digest("hex") as data.ImageToken;

/**
 * OpenIdConnectのclientSecretはfirebaseの環境変数に設定されている
 */
const getOpenIdConnectClientSecret = (
  openIdConnectProvider: data.OpenIdConnectProvider
): string => {
  return functions.config().openidconnectclientsecret[
    openIdConnectProvider.toLowerCase()
  ];
};

const getOpenIdConnectClientId = (
  openIdConnectProvider: data.OpenIdConnectProvider
): string => {
  switch (openIdConnectProvider) {
    case "Google":
      return "8347840964-l3796imv2d11d0qi8cnb6r48n5jabk9t.apps.googleusercontent.com";
    case "GitHub":
      return "b35031a84487b285978e";
  }
};

/**
 * アクセストークンを生成する
 */
const issueAccessToken = (): {
  accessToken: data.AccessToken;
  accessTokenHash: AccessTokenHash;
  issueTime: admin.firestore.Timestamp;
} => {
  const accessToken = crypto
    .randomBytes(32)
    .toString("hex") as data.AccessToken;
  return {
    accessToken,
    accessTokenHash: hashAccessToken(accessToken),
    issueTime: admin.firestore.Timestamp.now(),
  };
};

const hashAccessToken = (accessToken: data.AccessToken): AccessTokenHash =>
  crypto
    .createHash("sha256")
    .update(new Uint8Array(data.AccessToken.codec.encode(accessToken)))
    .digest("hex") as AccessTokenHash;

export const getUserByAccessToken = async (
  accessToken: data.AccessToken
): Promise<data.Maybe<data.IdAndData<data.UserId, data.User>>> => {
  const accessTokenHash: AccessTokenHash = hashAccessToken(accessToken);
  const userDataDocs = (
    await database
      .collection("user")
      .where("accessTokenHash", "==", accessTokenHash)
      .get()
  ).docs;
  if (userDataDocs.length !== 1) {
    return data.Maybe.Nothing();
  }
  const queryDocumentSnapshot = userDataDocs[0];
  const userData = queryDocumentSnapshot.data();

  return data.Maybe.Just<data.IdAndData<data.UserId, data.User>>({
    id: queryDocumentSnapshot.id as data.UserId,
    data: {
      name: userData.name,
      imageHash: userData.imageHash,
      introduction: userData.introduction,
      commentIdeaIdList: userData.commentedIdeaIdList,
      createTime: firestoreTimestampToTime(userData.createdAt),
      developProjectIdList: userData.developedProjectIdList,
      likeProjectIdList: userData.likedProjectIdList,
      getTime: util.timeFromDate(new Date()),
    },
  });
};

/**
 * ユーザーのスナップショットを取得する.
 * Nothingだった場合は指定したIDのユーザーがなかったということ
 * @param userId ユーザーID
 */
export const getUserSnapshot = async (
  userId: data.UserId
): Promise<data.Maybe<data.User>> => {
  const userData = (await database.collection("user").doc(userId).get()).data();
  if (userData === undefined) {
    return data.Maybe.Nothing();
  }
  return data.Maybe.Just({
    name: userData.name,
    imageHash: userData.imageHash,
    introduction: userData.introduction,
    commentIdeaIdList: userData.commentedIdeaIdList,
    createTime: firestoreTimestampToTime(userData.createdAt),
    developProjectIdList: userData.developedProjectIdList,
    likeProjectIdList: userData.likedProjectIdList,
    getTime: util.timeFromDate(new Date()),
  });
};

export const createProject = async (
  accessToken: data.AccessToken,
  projectName: string
): Promise<data.Maybe<data.IdAndData<data.ProjectId, data.Project>>> => {
  const userDataMaybe = await getUserByAccessToken(accessToken);
  switch (userDataMaybe._) {
    case "Just": {
      const userData = userDataMaybe.value;
      const normalizedProjectName = common.stringToValidProjectName(
        projectName
      );
      const projectNameWithDefault =
        normalizedProjectName === null ? "?" : normalizedProjectName;
      const projectId = createRandomId() as data.ProjectId;
      const iconHash = savePngFile(
        await image.createProjectIconFromChar(projectNameWithDefault[0])
      );
      const imageHash = savePngFile(
        await image.createProjectImage(projectNameWithDefault)
      );
      const createTime = admin.firestore.Timestamp.now();
      const createTimeAsTime = firestoreTimestampToTime(createTime);
      const project: ProjectData = {
        name: projectNameWithDefault,
        iconHash: await iconHash,
        imageHash: await imageHash,
        createUserId: userData.id,
        createTime,
        updateTime: createTime,
        partIdList: [],
        typePartIdList: [],
        tagList: await tokenize.tokenize(projectNameWithDefault),
      };

      database.collection("project").doc(projectId).create(project);
      return data.Maybe.Just<data.IdAndData<data.ProjectId, data.Project>>({
        id: projectId,
        data: {
          name: project.name,
          iconHash: project.iconHash,
          imageHash: project.imageHash,
          createUserId: project.createUserId,
          createTime: createTimeAsTime,
          updateTime: createTimeAsTime,
          getTime: createTimeAsTime,
          partIdList: project.partIdList,
          typePartIdList: project.typePartIdList,
        },
      });
    }
    case "Nothing": {
      return data.Maybe.Nothing();
    }
  }
};

export const getReadableStream = (
  imageToken: data.ImageToken
): stream.Readable => storageDefaultBucket.file(imageToken).createReadStream();

export const getFile = async (
  imageToken: data.ImageToken
): Promise<Uint8Array> => {
  const file = storageDefaultBucket.file(imageToken);
  const downloadResponse = (await file.download())[0];
  return downloadResponse;
};

export const getAllProjectId = async (): Promise<
  ReadonlyArray<data.ProjectId>
> => {
  const documentList = await database.collection("project").listDocuments();
  const list: Array<data.ProjectId> = [];
  for (const document of documentList) {
    list.push(document.id);
  }
  return list;
};

export const getAllProjectSnapshot = async (): Promise<
  ReadonlyArray<data.IdAndData<data.ProjectId, data.Project>>
> => {
  const querySnapshot: typedFirestore.QuerySnapshot<
    data.ProjectId,
    ProjectData
  > = await database.collection("project").get();
  const documentList: ReadonlyArray<typedFirestore.QueryDocumentSnapshot<
    data.ProjectId,
    ProjectData
  >> = querySnapshot.docs;
  const resultList: Array<data.IdAndData<data.ProjectId, data.Project>> = [];
  for (const document of documentList) {
    resultList.push({
      id: document.id,
      data: projectDataToProjectSnapshot(
        document.data(),
        util.timeFromDate(new Date())
      ),
    });
  }
  return resultList;
};

/**
 * プロジェクトのスナップショットを取得する.
 * Nothingだった場合は指定したIDのプロジェクトがなかったということ
 * @param projectId プロジェクトID
 */
export const getProjectSnapshot = async (
  projectId: data.ProjectId
): Promise<data.Maybe<data.Project>> => {
  const document = (
    await database.collection("project").doc(projectId).get()
  ).data();
  if (document === undefined) {
    return data.Maybe.Nothing();
  }
  return data.Maybe.Just<data.Project>(
    projectDataToProjectSnapshot(document, util.timeFromDate(new Date()))
  );
};

const projectDataToProjectSnapshot = (
  document: ProjectData,
  time: data.Time
): data.Project => ({
  name: document.name,
  iconHash: document.iconHash,
  imageHash: document.imageHash,
  createTime: firestoreTimestampToTime(document.createTime),
  createUserId: document.createUserId,
  getTime: time,
  updateTime: firestoreTimestampToTime(document.updateTime),
  partIdList: document.partIdList,
  typePartIdList: document.typePartIdList,
});

export const createIdea = async (
  createIdeaParameter: data.CreateIdeaParameter
): Promise<data.Maybe<data.IdAndData<data.IdeaId, data.Idea>>> => {
  const userDataMaybe = await getUserByAccessToken(
    createIdeaParameter.accessToken
  );
  if (userDataMaybe._ === "Nothing") {
    return data.Maybe.Nothing();
  }
  const validIdeaName = common.stringToValidIdeaName(
    createIdeaParameter.ideaName
  );
  if (validIdeaName === null) {
    return data.Maybe.Nothing();
  }
  // プロジェクトの存在確認
  if (
    !(
      await database
        .collection("project")
        .doc(createIdeaParameter.projectId)
        .get()
    ).exists
  ) {
    return data.Maybe.Nothing();
  }
  const createTime = admin.firestore.Timestamp.now();
  const ideaId = createRandomId() as data.IdeaId;
  const ideaData: IdeaData = {
    name: validIdeaName,
    createUserId: userDataMaybe.value.id,
    projectId: createIdeaParameter.projectId,
    createTime,
    itemList: [],
    updateTime: createTime,
    tagList: await tokenize.tokenize(validIdeaName),
  };
  await database.collection("idea").doc(ideaId).create(ideaData);
  return data.Maybe.Just({
    id: ideaId,
    data: ideaDocumentToIdeaSnapshot(
      ideaData,
      firestoreTimestampToTime(createTime)
    ),
  });
};

export const getIdea = async (
  ideaId: data.IdeaId
): Promise<data.Maybe<data.Idea>> => {
  const document = (await database.collection("idea").doc(ideaId).get()).data();
  if (document === undefined) {
    return data.Maybe.Nothing();
  }
  return data.Maybe.Just(
    ideaDocumentToIdeaSnapshot(document, util.timeFromDate(new Date()))
  );
};

export const getIdeaSnapshotAndIdListByProjectId = async (
  projectId: data.ProjectId
): Promise<ReadonlyArray<data.IdAndData<data.IdeaId, data.Idea>>> => {
  const querySnapshot = await database
    .collection("idea")
    .where("projectId", "==", projectId)
    .get();
  const list: Array<data.IdAndData<data.IdeaId, data.Idea>> = [];
  const getTime = util.timeFromDate(new Date());
  for (const document of querySnapshot.docs) {
    const documentValue = document.data();
    list.push({
      id: document.id,
      data: ideaDocumentToIdeaSnapshot(documentValue, getTime),
    });
  }
  console.log("getIdeaSnapshotAndIdListByProjectId output");
  console.log(list);
  return list;
};

const ideaDocumentToIdeaSnapshot = (
  ideaDocument: IdeaData,
  getTime: data.Time
): data.Idea => ({
  name: ideaDocument.name,
  createUserId: ideaDocument.createUserId,
  projectId: ideaDocument.projectId,
  createTime: firestoreTimestampToTime(ideaDocument.createTime),
  itemList: ideaDocument.itemList,
  updateTime: firestoreTimestampToTime(ideaDocument.updateTime),
  getTime,
});

export const addComment = async ({
  accessToken,
  comment,
  ideaId,
}: data.AddCommentParameter): Promise<data.Maybe<data.Idea>> => {
  const validComment = common.stringToValidComment(comment);
  if (validComment === null) {
    return data.Maybe.Nothing();
  }
  const user = await getUserByAccessToken(accessToken);
  if (user._ === "Nothing") {
    return data.Maybe.Nothing();
  }
  const ideaDocument = (
    await database.collection("idea").doc(ideaId).get()
  ).data();
  if (ideaDocument === undefined) {
    return data.Maybe.Nothing();
  }
  const updateTime = new Date();
  const newItemList: ReadonlyArray<data.IdeaItem> = [
    ...ideaDocument.itemList,
    {
      body: data.IdeaItemBody.Comment(validComment),
      createTime: util.timeFromDate(updateTime),
      createUserId: user.value.id,
    },
  ];
  const newIdeaData: IdeaData = {
    ...ideaDocument,
    itemList: newItemList,
    updateTime: admin.firestore.Timestamp.fromDate(updateTime),
  };
  const newIdeaDataWithNewTagList: IdeaData = {
    ...newIdeaData,
    tagList: await tokenize.tokenize(ideaGetText(newIdeaData)),
  };
  await database
    .collection("idea")
    .doc(ideaId)
    .update(newIdeaDataWithNewTagList);
  return data.Maybe.Just(
    ideaDocumentToIdeaSnapshot(
      newIdeaDataWithNewTagList,
      util.timeFromDate(updateTime)
    )
  );
};

const ideaGetText = (ideaData: IdeaData): string => {
  return [
    ideaData.name,
    ...ideaData.itemList.map((e) =>
      e.body._ === "Comment" ? e.body.string : ""
    ),
  ].join("\n");
};

export const getSuggestion = async (
  suggestionId: data.SuggestionId
): Promise<data.Maybe<data.Suggestion>> => {
  const document = (
    await database.collection("suggestion").doc(suggestionId).get()
  ).data();
  if (document === undefined) {
    return data.Maybe.Nothing();
  }
  return data.Maybe.Just({
    name: document.name,
    reason: document.reason,
    createUserId: document.createUserId,
    changeList: document.changeList,
    ideaId: document.ideaId,
    projectId: document.projectId,
    state: document.state,
    updateTime: firestoreTimestampToTime(document.updateTime),
    getTime: util.timeFromDate(new Date()),
  });
};

export const addSuggestion = async ({
  accessToken,
  ideaId,
}: data.AddSuggestionParameter): Promise<
  data.Maybe<data.IdAndData<data.SuggestionId, data.Suggestion>>
> => {
  const userDataMaybe = await getUserByAccessToken(accessToken);
  if (userDataMaybe._ === "Nothing") {
    return data.Maybe.Nothing();
  }
  const userData = userDataMaybe.value;
  const ideaDataMaybe = await getIdea(ideaId);
  if (ideaDataMaybe._ === "Nothing") {
    return data.Maybe.Nothing();
  }
  const ideaData = ideaDataMaybe.value;
  const suggestionId = createRandomId() as data.SuggestionId;
  const nowTime = new Date();
  const suggestionData: SuggestionData = {
    name: "",
    reason: "",
    createUserId: userData.id,
    projectId: ideaData.projectId,
    changeList: [],
    ideaId,
    updateTime: admin.firestore.Timestamp.fromDate(nowTime),
    state: data.SuggestionState.Creating,
  };
  await database
    .collection("suggestion")
    .doc(suggestionId)
    .create(suggestionData);
  const newItem: data.IdeaItem = {
    createTime: util.timeFromDate(nowTime),
    createUserId: userData.id,
    body: data.IdeaItemBody.SuggestionCreate(suggestionId),
  };
  await database
    .collection("idea")
    .doc(ideaId)
    .update({
      itemList: admin.firestore.FieldValue.arrayUnion(newItem),
    });

  return data.Maybe.Just({
    id: suggestionId,
    data: {
      name: suggestionData.name,
      reason: suggestionData.reason,
      changeList: suggestionData.changeList,
      createUserId: suggestionData.createUserId,
      ideaId: suggestionData.ideaId,
      projectId: suggestionData.projectId,
      state: suggestionData.state,
      updateTime: firestoreTimestampToTime(suggestionData.updateTime),
      getTime: util.timeFromDate(new Date()),
    },
  });
};
