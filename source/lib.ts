import * as admin from "firebase-admin";
import * as common from "definy-core";
import * as crypto from "crypto";
import * as functions from "firebase-functions";
import * as image from "./image";
import * as jimp from "jimp";
import * as jsonWebToken from "jsonwebtoken";
import * as stream from "stream";
import type * as typedFirestore from "typed-admin-firestore";
import * as util from "definy-core/source/util";
import {
  AccountToken,
  AccountTokenAndProjectId,
  AddCommentParameter,
  Comment,
  Commit,
  CommitId,
  CreateIdeaParameter,
  Expr,
  IdAndData,
  Idea,
  IdeaId,
  IdeaState,
  ImageToken,
  Maybe,
  OpenIdConnectProvider,
  PartHash,
  PartId,
  Project,
  ProjectId,
  ReleasePartId,
  ReleaseTypePartId,
  RequestLogInUrlRequestData,
  Resource,
  Time,
  Type,
  TypeAttribute,
  TypeParameter,
  TypePart,
  TypePartBody,
  TypePartHash,
  TypePartId,
  UrlData,
  User,
  UserId,
} from "definy-core/source/data";
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
    key: UserId;
    value: UserData;
    subCollections: Record<never, never>;
  };
  project: {
    key: ProjectId;
    value: ProjectData;
    subCollections: Record<never, never>;
  };
  idea: {
    key: IdeaId;
    value: IdeaData;
    subCollections: Record<never, never>;
  };
  commit: {
    key: CommitId;
    value: CommitData;
    subCollections: Record<never, never>;
  };
  part: {
    key: PartHash;
    value: PartData;
    subCollections: Record<never, never>;
  };
  typePart: {
    key: TypePartId;
    value: TypePartData;
    subCollections: Record<never, never>;
  };
  releasedPart: {
    key: ReleasePartId;
    value: ReleasePartData;
    subCollections: Record<never, never>;
  };
  releaseTypePart: {
    key: ReleaseTypePartId;
    value: ReleaseTypePartData;
    subCollections: Record<never, never>;
  };
}>;

type StateData = {
  createTime: admin.firestore.Timestamp;
  urlData: UrlData;
  provider: OpenIdConnectProvider;
};

/**
 * 登録してくれたユーザー
 */
type UserData = {
  /** アクセストークンのハッシュ値 */
  readonly accessTokenHash: AccessTokenHash;
  /** アクセストークンを発行した日時 */
  readonly accessTokenIssueTime: admin.firestore.Timestamp;
  readonly createTime: admin.firestore.Timestamp;
  readonly imageHash: ImageToken;
  readonly introduction: string;
  /** ユーザー名 */
  readonly name: string;
  /** ユーザーのログイン */
  readonly openIdConnect: OpenIdConnectProviderAndId;
};

/** ソーシャルログインに関する情報 */
type OpenIdConnectProviderAndId = {
  /** プロバイダー (例: Google, GitHub) */
  readonly provider: OpenIdConnectProvider;
  /** プロバイダー内でのアカウントID */
  readonly idInProvider: string;
};

type ProjectData = {
  readonly name: string;
  readonly iconHash: ImageToken;
  readonly imageHash: ImageToken;
  readonly createTime: admin.firestore.Timestamp;
  readonly updateTime: admin.firestore.Timestamp;
  readonly createUserId: UserId;
  readonly commitId: CommitId;
  readonly rootIdeaId: IdeaId;
};

type IdeaData = {
  readonly commentList: ReadonlyArray<Comment>;
  readonly createTime: admin.firestore.Timestamp;
  readonly createUserId: UserId;
  readonly name: string;
  readonly parentIdeaId: IdeaId | null;
  readonly projectId: ProjectId;
  readonly state: IdeaState;
  readonly updateTime: admin.firestore.Timestamp;
};

type CommitData = {
  readonly createTime: admin.firestore.Timestamp;
  readonly createUserId: UserId;
  readonly description: string;
  readonly ideaId: IdeaId;
  readonly isDraft: boolean;
  readonly partHashList: ReadonlyArray<PartHash>;
  readonly projectIconHash: ImageToken;
  readonly projectId: ProjectId;
  readonly projectImageHash: ImageToken;
  readonly projectName: string;
  readonly typePartHashList: ReadonlyArray<TypePartHash>;
  readonly updateTime: admin.firestore.Timestamp;
};

type PartData = {
  /** パーツの名前 */
  readonly name: string;
  /** 説明文 */
  readonly description: string;
  /** 型 */
  readonly type: Type;
  /** 式 */
  readonly expr: Expr;
  /** 所属しているプロジェクト */
  readonly projectId: Expr;
  /** 作成日時 */
  readonly createTime: admin.firestore.Timestamp;
  /** プロジェクト内での参照ID */
  readonly partId: PartId;
};

type TypePartData = {
  /** パーツの名前 */
  readonly name: string;
  /** 説明文 */
  readonly description: string;
  /** 型パーツの特殊扱いの種類 */
  readonly attribute: Maybe<TypeAttribute>;
  /** 型パラメーター */
  readonly typeParameterList: ReadonlyArray<TypeParameter>;
  /** 定義本体 */
  readonly typePartBody: TypePartBody;
  /** 所属しているプロジェクト */
  readonly projectId: ProjectId;
  /** 作成したコミット */
  readonly createCommitId: CommitId;
  /** 作成日時 */
  readonly createTime: admin.firestore.Timestamp;
};

type ReleasePartData = {
  /** パーツの名前 */
  readonly name: string;
  /** 説明文 */
  readonly description: string;
  /** 型 */
  readonly type: Type;
  /** 式 */
  readonly expr: Expr;
  /** 作成日時 */
  readonly createTime: admin.firestore.Timestamp;
  /** 更新日時 */
  readonly updateTime: admin.firestore.Timestamp;
  /** 作成したユーザー */
  readonly createUserId: UserId;
  /** 更新したユーザー */
  readonly updateUserIdList: ReadonlyArray<UserId>;
  /** 参照しているパーツ */
  readonly partHash: PartHash;
  /** 使用しているパーツ */
  readonly usePartId: ReadonlyArray<ReleasePartId>;
  /** 使用している型 (型の中で) */
  readonly useTypePartIdInType: ReadonlyArray<ReleaseTypePartId>;
  /** 使用している型 (式の中で) */
  readonly useTypePartIdInExpr: ReadonlyArray<ReleaseTypePartId>;
};

type ReleaseTypePartData = {
  /** 型パーツの名前 */
  readonly name: string;
};

export const requestLogInUrl = async (
  requestLogInUrlRequestData: RequestLogInUrlRequestData
): Promise<URL> => {
  const state = createRandomId();
  await database.collection("openConnectState").doc(state).create({
    createTime: admin.firestore.Timestamp.now(),
    urlData: requestLogInUrlRequestData.urlData,
    provider: requestLogInUrlRequestData.openIdConnectProvider,
  });
  return logInUrlFromOpenIdConnectProviderAndState(
    requestLogInUrlRequestData.openIdConnectProvider,
    state
  );
};

const logInUrlFromOpenIdConnectProviderAndState = (
  openIdConnectProvider: OpenIdConnectProvider,
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

const firestoreTimestampToTime = (timestamp: admin.firestore.Timestamp): Time =>
  util.timeFromDate(timestamp.toDate());

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
  openIdConnectProvider: OpenIdConnectProvider
): string =>
  "https://definy.app/logInCallback/" + (openIdConnectProvider as string);

/**
 * OpenIdConnectで外部ログインからの受け取ったデータを元に,ログインする前のURLとアクセストークンを返す
 * @param openIdConnectProvider
 * @param code
 * @param state
 */
export const logInCallback = async (
  openIdConnectProvider: OpenIdConnectProvider,
  code: string,
  state: string
): Promise<{ urlData: UrlData; accessToken: AccountToken }> => {
  const documentReference = database.collection("openConnectState").doc(state);
  const stateData = (await documentReference.get()).data();
  if (stateData === undefined) {
    throw new Error("Definy do not generate state.");
  }
  documentReference.delete();
  if (stateData.provider !== openIdConnectProvider) {
    throw new Error("Definy do not generate state.");
  }
  if (stateData.createTime.toMillis() + 60 * 1000 < new Date().getTime()) {
    throw new Error("state is too old.");
  }
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
  openIdConnectProvider: OpenIdConnectProvider,
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
  provider: OpenIdConnectProvider
): Promise<AccountToken> => {
  const imageHash = await getAndSaveUserImage(providerUserData.imageUrl);
  const createTime = admin.firestore.Timestamp.now();
  const accessTokenData = issueAccessToken();
  await database
    .collection("user")
    .doc(createRandomId() as UserId)
    .create({
      name: providerUserData.name,
      createTime,
      imageHash,
      introduction: "",
      accessTokenHash: accessTokenData.accessTokenHash,
      accessTokenIssueTime: accessTokenData.issueTime,
      openIdConnect: {
        idInProvider: providerUserData.id,
        provider,
      },
    });
  return accessTokenData.accessToken;
};

const getAndSaveUserImage = async (imageUrl: URL): Promise<ImageToken> => {
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
const savePngFile = (binary: Uint8Array): Promise<ImageToken> =>
  saveFile(binary, "image/png");

/**
 * Firebase Cloud Storage にファイルを保存する
 */
const saveFile = async (
  binary: Uint8Array,
  mimeType: string
): Promise<ImageToken> => {
  const hash = createImageTokenFromUint8ArrayAndMimeType(binary, mimeType);
  const file = storageDefaultBucket.file(hash);
  await file.save(binary, { contentType: mimeType });
  return hash;
};

export const createImageTokenFromUint8ArrayAndMimeType = (
  binary: Uint8Array,
  mimeType: string
): ImageToken =>
  crypto
    .createHash("sha256")
    .update(binary)
    .update(mimeType, "utf8")
    .digest("hex") as ImageToken;

const createHashFromUint8Array = (binary: Uint8Array): string =>
  crypto.createHash("sha256").update(binary).digest("hex");

/**
 * OpenIdConnectのclientSecretはfirebaseの環境変数に設定されている
 */
const getOpenIdConnectClientSecret = (
  openIdConnectProvider: OpenIdConnectProvider
): string => {
  return functions.config().openidconnectclientsecret[
    openIdConnectProvider.toLowerCase()
  ];
};

const getOpenIdConnectClientId = (
  openIdConnectProvider: OpenIdConnectProvider
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
  accessToken: AccountToken;
  accessTokenHash: AccessTokenHash;
  issueTime: admin.firestore.Timestamp;
} => {
  const accessToken = crypto.randomBytes(32).toString("hex") as AccountToken;
  return {
    accessToken,
    accessTokenHash: hashAccessToken(accessToken),
    issueTime: admin.firestore.Timestamp.now(),
  };
};

const hashAccessToken = (accountToken: AccountToken): AccessTokenHash =>
  crypto
    .createHash("sha256")
    .update(new Uint8Array(AccountToken.codec.encode(accountToken)))
    .digest("hex") as AccessTokenHash;

export const getUserByAccountToken = async (
  accountToken: AccountToken
): Promise<Maybe<IdAndData<UserId, Resource<User>>>> => {
  const accessTokenHash: AccessTokenHash = hashAccessToken(accountToken);
  const querySnapshot = await database
    .collection("user")
    .where("accessTokenHash", "==", accessTokenHash)
    .get();
  const getTime = firestoreTimestampToTime(querySnapshot.readTime);
  const userDataDocs = querySnapshot.docs;
  if (userDataDocs.length !== 1) {
    return Maybe.Nothing();
  }
  const queryDocumentSnapshot = userDataDocs[0];
  const userData = queryDocumentSnapshot.data();

  return Maybe.Just({
    id: queryDocumentSnapshot.id as UserId,
    data: {
      dataMaybe: Maybe.Just({
        name: userData.name,
        imageHash: userData.imageHash,
        introduction: userData.introduction,
        createTime: firestoreTimestampToTime(userData.createTime),
      }),
      getTime,
    },
  });
};

/**
 * ユーザーのデータを取得する.
 * Nothingだった場合は指定したIDのユーザーがなかったということ
 * @param userId ユーザーID
 */
export const getUser = async (userId: UserId): Promise<Resource<User>> => {
  const documentSnapshot = await database.collection("user").doc(userId).get();
  const userData = documentSnapshot.data();
  return {
    dataMaybe:
      userData === undefined
        ? Maybe.Nothing()
        : Maybe.Just({
            name: userData.name,
            imageHash: userData.imageHash,
            introduction: userData.introduction,
            createTime: firestoreTimestampToTime(userData.createTime),
          }),
    getTime: firestoreTimestampToTime(documentSnapshot.readTime),
  };
};

export const createProject = async (
  accountToken: AccountToken,
  projectName: string
): Promise<Maybe<IdAndData<ProjectId, Resource<Project>>>> => {
  const userDataMaybe = await getUserByAccountToken(accountToken);
  switch (userDataMaybe._) {
    case "Just": {
      const userData = userDataMaybe.value;
      const normalizedProjectName = common.stringToValidProjectName(
        projectName
      );
      const projectNameWithDefault =
        normalizedProjectName === null ? "?" : normalizedProjectName;
      const projectId = createRandomId() as ProjectId;
      const iconAndImage = await image.createProjectIconAndImage();
      const iconHashPromise = savePngFile(iconAndImage.icon);
      const imageHashPromise = savePngFile(iconAndImage.image);
      const createTime = admin.firestore.Timestamp.now();
      const createTimeAsTime = firestoreTimestampToTime(createTime);
      const rootIdeaId = createRandomId() as IdeaId;
      const emptyCommitId = createRandomId() as CommitId;
      const iconHash = await iconHashPromise;
      const imageHash = await imageHashPromise;
      await database.collection("idea").doc(rootIdeaId).create({
        name: "root idea",
        commentList: [],
        createTime,
        createUserId: userData.id,
        parentIdeaId: null,
        projectId,
        state: IdeaState.Creating,
        updateTime: createTime,
      });
      await database.collection("commit").doc(emptyCommitId).create({
        isDraft: false,
        createUserId: userData.id,
        description: "initial commit",
        ideaId: rootIdeaId,
        partHashList: [],
        typePartHashList: [],
        projectIconHash: iconHash,
        projectImageHash: imageHash,
        createTime,
        projectId,
        projectName: projectNameWithDefault,
        updateTime: createTime,
      });
      const project: ProjectData = {
        name: projectNameWithDefault,
        iconHash: await iconHashPromise,
        imageHash: await imageHashPromise,
        createUserId: userData.id,
        createTime,
        updateTime: createTime,
        commitId: emptyCommitId,
        rootIdeaId,
      };

      await database.collection("project").doc(projectId).create(project);
      return Maybe.Just<IdAndData<ProjectId, Resource<Project>>>({
        id: projectId,
        data: {
          dataMaybe: Maybe.Just<Project>({
            name: project.name,
            iconHash: project.iconHash,
            imageHash: project.imageHash,
            createUserId: project.createUserId,
            createTime: createTimeAsTime,
            updateTime: createTimeAsTime,
            commitId: emptyCommitId,
            rootIdeaId,
          }),
          getTime: createTimeAsTime,
        },
      });
    }
    case "Nothing": {
      return Maybe.Nothing();
    }
  }
};

export const getReadableStream = (imageToken: ImageToken): stream.Readable =>
  storageDefaultBucket.file(imageToken).createReadStream();

export const getFile = async (
  imageToken: ImageToken
): Promise<Maybe<Uint8Array>> => {
  const file = storageDefaultBucket.file(imageToken);
  const downloadResponse: Buffer | undefined = (await file.download())[0];
  return downloadResponse === undefined
    ? Maybe.Nothing()
    : Maybe.Just(downloadResponse);
};

export const getTop50Project = async (): Promise<
  ReadonlyArray<IdAndData<ProjectId, Resource<Project>>>
> => {
  const querySnapshot: typedFirestore.QuerySnapshot<
    ProjectId,
    ProjectData
  > = await database.collection("project").limit(50).get();
  const documentList: ReadonlyArray<typedFirestore.QueryDocumentSnapshot<
    ProjectId,
    ProjectData
  >> = querySnapshot.docs;
  const resultList: Array<IdAndData<ProjectId, Resource<Project>>> = [];
  const getTime = firestoreTimestampToTime(querySnapshot.readTime);
  for (const document of documentList) {
    resultList.push({
      id: document.id,
      data: {
        dataMaybe: Maybe.Just(projectDataToProjectSnapshot(document.data())),
        getTime,
      },
    });
  }
  return resultList;
};

/**
 * プロジェクトのスナップショットを取得する.
 * Nothingだった場合は指定したIDのプロジェクトがなかったということ
 * @param projectId プロジェクトID
 */
export const getProject = async (
  projectId: ProjectId
): Promise<Resource<Project>> => {
  const documentSnapshot = await database
    .collection("project")
    .doc(projectId)
    .get();
  const document = documentSnapshot.data();
  return {
    dataMaybe:
      document === undefined
        ? Maybe.Nothing()
        : Maybe.Just<Project>(projectDataToProjectSnapshot(document)),
    getTime: firestoreTimestampToTime(documentSnapshot.readTime),
  };
};

const projectDataToProjectSnapshot = (document: ProjectData): Project => ({
  name: document.name,
  iconHash: document.iconHash,
  imageHash: document.imageHash,
  createTime: firestoreTimestampToTime(document.createTime),
  createUserId: document.createUserId,
  updateTime: firestoreTimestampToTime(document.updateTime),
  commitId: document.commitId,
  rootIdeaId: document.rootIdeaId,
});

export const createIdea = async (
  parameter: CreateIdeaParameter
): Promise<Maybe<IdAndData<IdeaId, Resource<Idea>>>> => {
  const userIdAndUserResource = await getUserByAccountToken(
    parameter.accountToken
  );
  if (userIdAndUserResource._ === "Nothing") {
    return Maybe.Nothing();
  }
  const validIdeaName = common.stringToValidIdeaName(parameter.ideaName);
  if (validIdeaName === null) {
    return Maybe.Nothing();
  }
  // 親アイデアの取得
  const parentIdea = (
    await database.collection("idea").doc(parameter.parentId).get()
  ).data();
  if (parentIdea === undefined) {
    return Maybe.Nothing();
  }
  const createTime = admin.firestore.Timestamp.now();
  const ideaId = createRandomId() as IdeaId;
  const ideaData: IdeaData = {
    name: validIdeaName,
    createUserId: userIdAndUserResource.value.id,
    projectId: parentIdea.projectId,
    createTime,
    commentList: [],
    parentIdeaId: parameter.parentId,
    state: IdeaState.Creating,
    updateTime: createTime,
  };
  const writeResult = await database
    .collection("idea")
    .doc(ideaId)
    .create(ideaData);

  return Maybe.Just({
    id: ideaId,
    data: {
      dataMaybe: Maybe.Just(ideaDocumentToIdeaSnapshot(ideaData)),
      getTime: firestoreTimestampToTime(writeResult.writeTime),
    },
  });
};

export const getIdea = async (ideaId: IdeaId): Promise<Resource<Idea>> => {
  const documentSnapshot = await database.collection("idea").doc(ideaId).get();
  const getTime = firestoreTimestampToTime(documentSnapshot.readTime);
  const document = documentSnapshot.data();
  return {
    dataMaybe:
      document === undefined
        ? Maybe.Nothing()
        : Maybe.Just(ideaDocumentToIdeaSnapshot(document)),
    getTime,
  };
};

export const getIdeaSnapshotAndIdListByProjectId = async (
  projectId: ProjectId
): Promise<ReadonlyArray<IdAndData<IdeaId, Resource<Idea>>>> => {
  const querySnapshot = await database
    .collection("idea")
    .where("projectId", "==", projectId)
    .get();
  const list: Array<IdAndData<IdeaId, Resource<Idea>>> = [];
  const getTime = firestoreTimestampToTime(querySnapshot.readTime);
  for (const document of querySnapshot.docs) {
    const documentValue = document.data();
    list.push({
      id: document.id,
      data: {
        dataMaybe: Maybe.Just(ideaDocumentToIdeaSnapshot(documentValue)),
        getTime,
      },
    });
  }
  return list;
};

export const getIdeaByParentIdeaId = async (
  ideaId: IdeaId
): Promise<ReadonlyArray<IdAndData<IdeaId, Resource<Idea>>>> => {
  const querySnapshot = await database
    .collection("idea")
    .where("parentIdeaId", "==", ideaId)
    .get();
  const getTime = firestoreTimestampToTime(querySnapshot.readTime);
  return querySnapshot.docs.map((doc) => ({
    id: doc.id,
    data: {
      dataMaybe: Maybe.Just(ideaDocumentToIdeaSnapshot(doc.data())),
      getTime,
    },
  }));
};

const ideaDocumentToIdeaSnapshot = (ideaDocument: IdeaData): Idea => ({
  name: ideaDocument.name,
  createUserId: ideaDocument.createUserId,
  projectId: ideaDocument.projectId,
  createTime: firestoreTimestampToTime(ideaDocument.createTime),
  state: ideaDocument.state,
  commentList: ideaDocument.commentList,
  parentIdeaId:
    ideaDocument.parentIdeaId === null
      ? Maybe.Nothing()
      : Maybe.Just(ideaDocument.parentIdeaId),
  updateTime: firestoreTimestampToTime(ideaDocument.updateTime),
});

export const addComment = async (
  parameter: AddCommentParameter
): Promise<Maybe<Resource<Idea>>> => {
  const validComment = common.stringToValidComment(parameter.comment);
  if (validComment === null) {
    return Maybe.Nothing();
  }
  const user = await getUserByAccountToken(parameter.accountToken);
  if (user._ === "Nothing") {
    return Maybe.Nothing();
  }
  const ideaDocument = (
    await database.collection("idea").doc(parameter.ideaId).get()
  ).data();
  if (ideaDocument === undefined) {
    return Maybe.Nothing();
  }
  const updateTime = new Date();
  const newCommentList: ReadonlyArray<Comment> = [
    ...ideaDocument.commentList,
    {
      body: validComment,
      createTime: util.timeFromDate(updateTime),
      createUserId: user.value.id,
    },
  ];
  const newIdeaData: IdeaData = {
    ...ideaDocument,
    commentList: newCommentList,
    updateTime: admin.firestore.Timestamp.fromDate(updateTime),
  };
  const writeResult = await database
    .collection("idea")
    .doc(parameter.ideaId)
    .update(newIdeaData);
  return Maybe.Just({
    dataMaybe: Maybe.Just(ideaDocumentToIdeaSnapshot(newIdeaData)),
    getTime: firestoreTimestampToTime(writeResult.writeTime),
  });
};

export const getCommit = async (
  commitId: CommitId
): Promise<Resource<Commit>> => {
  const documentSnapshot = await database
    .collection("commit")
    .doc(commitId)
    .get();
  const document = documentSnapshot.data();
  return {
    dataMaybe:
      document === undefined
        ? Maybe.Nothing()
        : Maybe.Just<Commit>({
            description: document.description,
            createUserId: document.createUserId,
            ideaId: document.ideaId,
            projectId: document.projectId,
            projectName: document.projectName,
            projectIcon: document.projectIconHash,
            partHashList: document.partHashList,
            typePartHashList: [],
            projectImage: document.projectImageHash,
            updateTime: firestoreTimestampToTime(document.updateTime),
            isDraft: document.isDraft,
            createTime: firestoreTimestampToTime(document.createTime),
          }),
    getTime: firestoreTimestampToTime(documentSnapshot.readTime),
  };
};

export const getTypePartByProjectId = async (
  projectId: ProjectId
): Promise<Resource<ReadonlyArray<IdAndData<TypePartId, TypePart>>>> => {
  const documentSnapshot = await database
    .collection("typePart")
    .where("projectId", "==", projectId)
    .get();
  return {
    dataMaybe: Maybe.Just(
      documentSnapshot.docs.map((document) =>
        typePartFromDBType(document.id, document.data())
      )
    ),
    getTime: firestoreTimestampToTime(documentSnapshot.readTime),
  };
};

export const addTypePart = async (
  accountTokenAndProjectId: AccountTokenAndProjectId
): Promise<Resource<ReadonlyArray<IdAndData<TypePartId, TypePart>>>> => {
  const userPromise = getUserByAccountToken(
    accountTokenAndProjectId.accountToken
  );
  const projectPromise = getProject(accountTokenAndProjectId.projectId);
  const user = await userPromise;
  if (user._ === "Nothing") {
    throw new Error("invalid account token");
  }
  const project = await projectPromise;
  if (project.dataMaybe._ === "Nothing") {
    throw new Error("invalid project id");
  }
  if (project.dataMaybe.value.createUserId !== user.value.id) {
    throw new Error("user can not edit this project");
  }
  const newTypePart: TypePart = {
    name: "NewType",
    description: "",
    attribute: Maybe.Nothing(),
    projectId: accountTokenAndProjectId.projectId,
    typeParameterList: [],
    createCommitId: "c10b49a4cc73fa3900d44ddd6294a9b5" as CommitId,
    body: TypePartBody.Sum([]),
  };
  await database
    .collection("typePart")
    .doc(createRandomId() as TypePartId)
    .set(typePartToDBType(newTypePart, admin.firestore.Timestamp.now()));
  return getTypePartByProjectId(accountTokenAndProjectId.projectId);
};

const typePartFromDBType = (
  typePartId: TypePartId,
  typePartData: TypePartData
): IdAndData<TypePartId, TypePart> => {
  return {
    id: typePartId,
    data: {
      name: typePartData.name,
      description: typePartData.description,
      attribute: typePartData.attribute,
      typeParameterList: typePartData.typeParameterList,
      body: typePartData.typePartBody,
      projectId: typePartData.projectId,
      createCommitId: typePartData.createCommitId,
    },
  };
};

const typePartToDBType = (
  typePart: TypePart,
  createTime: admin.firestore.Timestamp
): TypePartData => ({
  name: typePart.name,
  description: typePart.description,
  attribute: typePart.attribute,
  typeParameterList: typePart.typeParameterList,
  createCommitId: typePart.createCommitId,
  createTime,
  projectId: typePart.projectId,
  typePartBody: typePart.body,
});
