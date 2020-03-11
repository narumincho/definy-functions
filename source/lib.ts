import * as common from "definy-common";
import { URL } from "url";
import * as admin from "firebase-admin";
import * as typedFirestore from "typed-admin-firestore";
import * as crypto from "crypto";

const app = admin.initializeApp();

type AccessTokenHash = string & { _accessTokenHash: never };

const database = (app.firestore() as unknown) as typedFirestore.Firestore<{
  openConnectState: {
    key: string;
    value: StateData;
    subCollections: {};
  };
  accessToken: {
    key: AccessTokenHash;
    value: AccessTokenData;
    subCollections: {};
  };
  user: {
    key: common.data.UserId;
    value: UserData;
    subCollections: {};
  };
}>;

type StateData = {
  createdAt: admin.firestore.Timestamp;
  urlData: common.data.UrlData;
  provider: common.data.OpenIdConnectProvider;
};

/**
 * アクセストークンに含まれるデータ
 */
type AccessTokenData = {
  /** アクセストークンを発行したユーザー */
  readonly userId: common.data.UserId;
  /** 発行日時 */
  readonly issuedAt: admin.firestore.Timestamp;
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
  readonly imageHash: common.data.FileHash;
  /**
   * 自己紹介文。改行文字を含めることができる。
   *
   * Twitterと同じ 0～160文字
   */
  readonly introduction: string;
  /** ユーザーが作成された日時 */
  readonly createdAt: admin.firestore.Timestamp;
  /** プロジェクトに対する いいね */
  readonly likedProjectIdList: ReadonlyArray<common.data.ProjectId>;

  readonly developedProjectIdList: ReadonlyArray<common.data.ProjectId>;

  readonly commentedIdeaIdList: ReadonlyArray<common.data.IdeaId>;
  /** 最後にログインしたアクセストークンのハッシュ値 */
  readonly lastAccessTokenHash: AccessTokenHash;
  /** ユーザーのログイン */
  readonly openIdConnect: OpenIdConnectProviderAndId;
};

/** ソーシャルログインに関する情報 */
type OpenIdConnectProviderAndId = {
  /** プロバイダー (例: LINE, Google, GitHub) */
  readonly provider: common.data.OpenIdConnectProvider;
  /** プロバイダー内でのアカウントID */
  readonly idInProvider: string;
};

export const requestLogInUrl = async (
  requestLogInUrlRequestData: common.data.RequestLogInUrlRequestData
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
  requestLogInUrlRequestData: common.data.RequestLogInUrlRequestData,
  state: string,
  createdAt: admin.firestore.Timestamp
): Promise<void> => {
  const stateData: StateData = {
    createdAt: createdAt,
    urlData: requestLogInUrlRequestData.urlData,
    provider: requestLogInUrlRequestData.openIdConnectProvider
  };
  await database
    .collection("openConnectState")
    .doc(state)
    .create(stateData);
};

const logInUrlFromOpenIdConnectProviderAndState = (
  openIdConnectProvider: common.data.OpenIdConnectProvider,
  state: string
): URL => {
  switch (openIdConnectProvider) {
    case "Google":
      return createUrl(
        "https://accounts.google.com/o/oauth2/v2/auth",
        new Map([
          ["response_type", "code"],
          [
            "client_id",
            "8347840964-l3796imv2d11d0qi8cnb6r48n5jabk9t.apps.googleusercontent.com"
          ],
          ["redirect_uri", logInRedirectUri("Google")],
          ["scope", "profile openid"],
          ["state", state]
        ])
      );
    case "GitHub":
      return createUrl(
        "https://github.com/login/oauth/authorize",
        new Map([
          ["response_type", "code"],
          ["client_id", "b35031a84487b285978e"],
          ["redirect_uri", logInRedirectUri("GitHub")],
          ["scope", "read:user"],
          ["state", state]
        ])
      );
  }
};

export const getUser = async (
  userId: common.data.UserId
): Promise<common.data.Result<common.data.UserPublic, string>> => {
  const data = (
    await database
      .collection("user")
      .doc(userId)
      .get()
  ).data();
  if (data === undefined) {
    return common.data.resultError(
      "ユーザーが見つからなかった id=" + (userId as string)
    );
  }
  return common.data.resultOk({
    name: data.name,
    imageHash: data.imageHash,
    introduction: data.introduction,
    createdAt: firestoreTimestampToDateTime(data.createdAt),
    likedProjectIdList: data.likedProjectIdList,
    developedProjectIdList: data.developedProjectIdList,
    commentedIdeaIdList: []
  });
};

const firestoreTimestampToDateTime = (
  timestamp: admin.firestore.Timestamp
): common.data.DateTime => {
  const date = timestamp.toDate();
  return {
    year: 10000 + date.getUTCFullYear(),
    month: 1 + date.getUTCMonth(),
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds()
  };
};

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
  openIdConnectProvider: common.data.OpenIdConnectProvider
): string =>
  "https://us-central1-definy-lang.cloudfunctions.net/logInCallback/" +
  (openIdConnectProvider as string);
