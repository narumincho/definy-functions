import * as common from "definy-common";
import { data } from "definy-common";
import { URL } from "url";
import * as admin from "firebase-admin";
import * as typedFirestore from "typed-admin-firestore";
import * as crypto from "crypto";
import * as functions from "firebase-functions";
import axios, { AxiosResponse } from "axios";
import * as jsonWebToken from "jsonwebtoken";
import * as stream from "stream";
import * as sharp from "sharp";
import * as image from "./image";

const app = admin.initializeApp();

type AccessTokenHash = string & { _accessTokenHash: never };

const storageDefaultBucket = app.storage().bucket();
const database = (app.firestore() as unknown) as typedFirestore.Firestore<{
  openConnectState: {
    key: string;
    value: StateData;
    subCollections: {};
  };
  user: {
    key: data.UserId;
    value: UserData;
    subCollections: {};
  };
  project: {
    key: data.ProjectId;
    value: ProjectData;
    subCollections: {};
  };
}>;

type StateData = {
  createdAt: admin.firestore.Timestamp;
  urlData: data.UrlData;
  provider: data.OpenIdConnectProvider;
};

/**
 * 登録してくれたユーザー
 */
type UserData = {
  /** ユーザー名
   * 表示される名前。他のユーザーとかぶっても良い。絵文字も使える
   * 全角英数は半角英数、半角カタカナは全角カタカナ、(株)の合字を分解するなどのNFKCの正規化がされる
   * U+0000-U+0019 と U+007F-U+00A0 の範囲の文字は入らない
   * 前後に空白を含められない
   * 間の空白は2文字以上連続しない
   * 文字数のカウント方法は正規化されたあとのCodePoint単位
   * Twitterと同じ、1文字以上50文字以下
   */
  readonly name: string;
  /**
   * プロフィール画像
   */
  readonly imageHash: data.FileHash;
  /**
   * 自己紹介文。改行文字を含めることができる。
   *
   * Twitterと同じ 0～160文字
   */
  readonly introduction: string;
  /** ユーザーが作成された日時 */
  readonly createdAt: admin.firestore.Timestamp;
  /** プロジェクトに対する いいね */
  readonly likedProjectIdList: ReadonlyArray<data.ProjectId>;

  readonly developedProjectIdList: ReadonlyArray<data.ProjectId>;

  readonly commentedIdeaIdList: ReadonlyArray<data.IdeaId>;
  /** アクセストークンのハッシュ値 */
  readonly accessTokenHashList: Array<AccessTokenHash>;
  /** アクセストークンを発行した日時 */
  readonly accessTokenIssuedAtList: ReadonlyArray<admin.firestore.Timestamp>;
  /** ユーザーのログイン */
  readonly openIdConnect: OpenIdConnectProviderAndId;
};

type ProjectData = {
  readonly name: string;
  readonly icon: data.FileHash;
  readonly image: data.FileHash;
  readonly createdAt: admin.firestore.Timestamp;
  readonly createdBy: data.UserId;
};
/** ソーシャルログインに関する情報 */
type OpenIdConnectProviderAndId = {
  /** プロバイダー (例: LINE, Google, GitHub) */
  readonly provider: data.OpenIdConnectProvider;
  /** プロバイダー内でのアカウントID */
  readonly idInProvider: string;
};

type ReleasePartMeta = {
  /** パーツの名前 */
  name: MultiLanguageText;
  /** 説明文 */
  description: MultiLanguageText;
  /** 属しているモジュール */
  moduleId: string;
  /** 語句.検索用 */
  nounList: ReadonlyArray<string>;
  /** 使用している型.検索用 */
  usedTypeList: ReadonlyArray<string>;
  /** 使用しているパーツ.検索用 */
  usedPartList: ReadonlyArray<string>;
  /** 型 */
  type: TypeExpr;
  /** 互換性が維持される間の過去のデータ */
  before: ReadonlyArray<{
    name: MultiLanguageText;
    description: string;
    oldAt: admin.firestore.Timestamp;
  }>;
  /** 作成元 (必ずしも削除されたパーツからではない) */
  parent: ReadonlyArray<string>;
  /** 移行先 (代用可ではない, 最新リリースで削除された(!=[])) */
  destination: ReadonlyArray<string>;
  /** 最終更新日時 */
  updateAt: admin.firestore.Timestamp;
  /** 作成日時 */
  createdAt: admin.firestore.Timestamp;
};

type ReleaseTypeMeta = {
  /** パーツの名前 */
  name: MultiLanguageText;
  /** 説明文 */
  description: MultiLanguageText;
  /** 属しているモジュール */
  moduleId: string;
  /** 語句.検索用 */
  nounList: ReadonlyArray<string>;
  /** 使用している型.検索用 */
  usedTypeList: ReadonlyArray<string>;
  /** 互換性が維持される間の過去のデータ */
  before: ReadonlyArray<{
    name: MultiLanguageText;
    description: string;
    oldAt: admin.firestore.Timestamp;
  }>;
  /** 作成元 (必ずしも削除された型からではない) */
  parent: ReadonlyArray<string>;
  /** 移行先 (代用可ではない, 最新リリースで削除された(!=[])) */
  destination: ReadonlyArray<string>;
  /** 定義本体 */
  type: TypeBody;
  /** 最終更新日時 */
  updateAt: admin.firestore.Timestamp;
  /** 作成日時 */
  createdAt: admin.firestore.Timestamp;
};

type ReleaseModuleMeta = {
  /** モジュール名 (階層を作ることができる) */
  name: ReadonlyArray<MultiLanguageText>;
  /** 属しているプロジェクト */
  projectId: data.ProjectId;
  /** 説明文 */
  description: string;
  /** 外部のプロジェクトに公開するかどうか */
  export: boolean;
  /** 作成日時 */
  createdAt: admin.firestore.Timestamp;
};

type MultiLanguageText = {
  en: string;
  ja: string;
};

type TypeBody = {};

type TypeExpr = {};

type Expr = {};

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
    createdAt: createdAt,
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

export const getUser = async (
  userId: data.UserId
): Promise<data.Result<data.User, string>> => {
  const userDocument = (
    await database.collection("user").doc(userId).get()
  ).data();
  if (userDocument === undefined) {
    return data.resultError(
      "ユーザーが見つからなかった id=" + (userId as string)
    );
  }
  return data.resultOk({
    name: userDocument.name,
    imageHash: userDocument.imageHash,
    introduction: userDocument.introduction,
    createdAt: firestoreTimestampToTime(userDocument.createdAt),
    likedProjectIdList: userDocument.likedProjectIdList,
    developedProjectIdList: userDocument.developedProjectIdList,
    commentedIdeaIdList: [],
  });
};

const firestoreTimestampToTime = (
  timestamp: admin.firestore.Timestamp
): data.Time => common.util.timeFromDate(timestamp.toDate());

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
 * OpenIdConnectで外部ログインからの受け取ったデータを元にログイントークンの入ったURLを返す
 * @param openIdConnectProvider
 * @param code
 * @param state
 */
export const logInCallback = async (
  openIdConnectProvider: data.OpenIdConnectProvider,
  code: string,
  state: string
): Promise<data.UrlData> => {
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
      ...stateData.urlData,
      accessToken: data.maybeJust(accessToken),
    };
  }
  const userQueryDocumentSnapshot = documentList[0];
  const userDocumentReference = userQueryDocumentSnapshot.ref;
  const accessTokenData = issueAccessToken();
  await userDocumentReference.update({
    accessTokenHashList: admin.firestore.FieldValue.arrayUnion(
      accessTokenData.accessTokenHash
    ),
    accessTokenIssuedAtList: admin.firestore.FieldValue.arrayUnion(
      accessTokenData.issuedAt
    ),
  });
  return {
    ...stateData.urlData,
    accessToken: data.maybeJust(accessTokenData.accessToken),
  };
};

type ProviderUserData = {
  id: string;
  name: string;
  imageUrl: URL;
};

const getUserDataFromCode = async (
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
  const accessToken: unknown = responseData["access_token"];
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
    id: id,
    name: name,
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
      createdAt: createdAt,
      developedProjectIdList: [],
      imageHash: imageHash,
      introduction: "",
      accessTokenHashList: [accessTokenData.accessTokenHash],
      accessTokenIssuedAtList: [accessTokenData.issuedAt],
      likedProjectIdList: [],
      openIdConnect: {
        idInProvider: providerUserData.id,
        provider: provider,
      },
    });
  return accessTokenData.accessToken;
};

const getAndSaveUserImage = async (imageUrl: URL): Promise<data.FileHash> => {
  const response: AxiosResponse<Buffer> = await axios.get(imageUrl.toString(), {
    responseType: "arraybuffer",
  });
  const resizedImageBuffer = await sharp(response.data)
    .resize(64, 64, { fit: "inside" })
    .png()
    .toBuffer();
  return await savePngFile(resizedImageBuffer);
};

/**
 * Firebase Cloud Storage にPNGファイルを保存する
 */
const savePngFile = async (buffer: Buffer): Promise<data.FileHash> =>
  saveFile(buffer, "image/png");

/**
 * Firebase Cloud Storage にファイルを保存する
 */
const saveFile = async (
  buffer: Buffer,
  mimeType: string
): Promise<data.FileHash> => {
  const hash = createHashFromBuffer(buffer, mimeType);
  const file = storageDefaultBucket.file(hash);
  await file.save(buffer, { contentType: mimeType });
  return hash;
};

export const createHashFromBuffer = (
  data: Buffer,
  mimeType: string
): data.FileHash =>
  crypto
    .createHash("sha256")
    .update(data)
    .update(mimeType, "utf8")
    .digest("hex") as data.FileHash;

/**
 * OpenIdConnectのclientSecretはfirebaseの環境変数に設定されている
 */
const getOpenIdConnectClientSecret = (
  openIdConnectProvider: data.OpenIdConnectProvider
): string => {
  return functions.config()["openidconnectclientsecret"][
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
  issuedAt: admin.firestore.Timestamp;
} => {
  const accessToken = crypto
    .randomBytes(32)
    .toString("hex") as data.AccessToken;
  return {
    accessToken: accessToken,
    accessTokenHash: hashAccessToken(accessToken),
    issuedAt: admin.firestore.Timestamp.now(),
  };
};

const hashAccessToken = (accessToken: data.AccessToken): AccessTokenHash =>
  crypto
    .createHash("sha256")
    .update(new Uint8Array(data.encodeToken(accessToken)))
    .digest("hex") as AccessTokenHash;

export const getUserByAccessToken = async (
  accessToken: data.AccessToken
): Promise<data.Maybe<data.UserAndUserId>> => {
  const accessTokenHash: AccessTokenHash = hashAccessToken(accessToken);
  const userDataDocs = (
    await database
      .collection("user")
      .where("accessTokenHashList", "array-contains", accessTokenHash)
      .get()
  ).docs;
  if (userDataDocs.length !== 1) {
    return data.maybeNothing();
  }
  const queryDocumentSnapshot = userDataDocs[0];
  const userData = queryDocumentSnapshot.data();

  return data.maybeJust({
    userId: queryDocumentSnapshot.id as data.UserId,
    user: {
      name: userData.name,
      imageHash: userData.imageHash,
      introduction: userData.introduction,
      commentedIdeaIdList: userData.commentedIdeaIdList,
      createdAt: firestoreTimestampToTime(userData.createdAt),
      developedProjectIdList: userData.developedProjectIdList,
      likedProjectIdList: userData.likedProjectIdList,
    },
  });
};

export const getUserData = async (
  userId: data.UserId
): Promise<data.Maybe<data.User>> => {
  const userData = (
    await (await database.collection("user").doc(userId)).get()
  ).data();
  if (userData === undefined) {
    return data.maybeNothing();
  }
  return data.maybeJust({
    name: userData.name,
    imageHash: userData.imageHash,
    introduction: userData.introduction,
    commentedIdeaIdList: userData.commentedIdeaIdList,
    createdAt: firestoreTimestampToTime(userData.createdAt),
    developedProjectIdList: userData.developedProjectIdList,
    likedProjectIdList: userData.likedProjectIdList,
  });
};

export const createProject = async (
  accessToken: data.AccessToken,
  projectName: string
): Promise<data.Maybe<data.ProjectAndProjectId>> => {
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
        image.createProjectIconFromChar(projectNameWithDefault[0])
      );
      const imageHash = savePngFile(
        image.createProjectImage(projectNameWithDefault)
      );
      const project: ProjectData = {
        name: projectNameWithDefault,
        icon: await iconHash,
        image: await imageHash,
        createdBy: userData.userId,
        createdAt: admin.firestore.Timestamp.now(),
      };

      database.collection("project").doc(projectId).create(project);
      return data.maybeJust({
        projectId: projectId,
        project: {
          name: project.name,
          icon: project.icon,
          image: project.image,
          createdBy: project.createdBy,
          createdAt: firestoreTimestampToTime(project.createdAt),
        },
      });
    }
    case "Nothing": {
      return data.maybeNothing();
    }
  }
};

export const getReadableStream = (fileHash: data.FileHash): stream.Readable =>
  storageDefaultBucket.file(fileHash).createReadStream();

export const getFile = async (fileHash: data.FileHash): Promise<Uint8Array> => {
  const file = storageDefaultBucket.file(fileHash);
  const downloadResponse = (await file.download())[0];
  return downloadResponse;
};

export const getAllProjectId = async (): Promise<
  ReadonlyArray<data.ProjectId>
> => {
  const documentList = await database.collection("project").listDocuments();
  const list = [];
  for (const document of documentList) {
    list.push(document.id);
  }
  return list;
};

export const getProject = async (
  projectId: data.ProjectId
): Promise<data.Maybe<data.Project>> => {
  const document = (
    await database.collection("project").doc(projectId).get()
  ).data();
  if (document === undefined) {
    return data.maybeNothing();
  }
  return data.maybeJust<data.Project>({
    name: document.name,
    icon: document.icon,
    image: document.image,
    createdAt: firestoreTimestampToTime(document.createdAt),
    createdBy: document.createdBy,
  });
};
