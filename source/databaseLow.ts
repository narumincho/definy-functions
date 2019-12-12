import * as admin from "firebase-admin";
import * as type from "./type";
import * as firestore from "@google-cloud/firestore";
import * as stream from "stream";
import * as definyFirestoreType from "definy-firestore-type";
import * as typedFirestore from "typed-admin-firestore";

const app = admin.initializeApp();

const dataBase = (app.firestore() as unknown) as typedFirestore.Firestore<
  definyFirestoreType.Firestore
>;
const storageDefaultBucket = app.storage().bucket();

const userCollection = dataBase.collection("user");
const UserSecretCollection = dataBase.collection("userSecret");
const accessTokenCollection = dataBase.collection("accessToken");
const collectionFromLogInState = (
  logInService: definyFirestoreType.SocialLoginService
): typedFirestore.CollectionReference<{
  doc: definyFirestoreType.State;
  col: {};
}> => {
  switch (logInService) {
    case "google":
      return dataBase.collection("googleState");
    case "gitHub":
      return dataBase.collection("gitHubState");
    case "line":
      return dataBase.collection("lineState");
  }
};
const projectCollection = dataBase.collection("project");
const moduleCollection = dataBase.collection("moduleSnapshot");
const branchCollection = dataBase.collection("branch");
const commitCollection = dataBase.collection("commit");
const draftCommitCollection = dataBase.collection("draftCommit");
const typeCollection = dataBase.collection("typeDefSnapshot");
const partCollection = dataBase.collection("partDefSnapshot");
/* ==========================================
                    User
   ==========================================
*/
/**
 * ユーザーのデータを追加する
 * @param userData ユーザー情報
 * @returns ユーザーのID
 */
export const addUser = async (
  userId: definyFirestoreType.UserId,
  userData: definyFirestoreType.User,
  userSecretData: definyFirestoreType.UserSecret
): Promise<definyFirestoreType.UserId> => {
  const batch = dataBase.batch();
  batch.create(userCollection.doc(userId), userData);
  batch.create(UserSecretCollection.doc(userId), userSecretData);
  await batch.commit();
  return userId;
};

/**
 * ユーザーのデータを取得する
 * @param userId
 */
export const getUser = async (
  userId: definyFirestoreType.UserId
): Promise<definyFirestoreType.User> => {
  const userData = (await userCollection.doc(userId).get()).data();
  if (userData === undefined) {
    throw new Error(`There was no user with userId = ${userId}`);
  }
  return userData;
};

/**
 * ユーザーのデータを更新する
 */
export const updateUser = async (
  userId: definyFirestoreType.UserId,
  data: Partial<definyFirestoreType.User>
): Promise<void> => {
  await userCollection.doc(userId).update(data);
};

/**
 * 自分以外には見られてはいけないデータを更新する
 */
export const updateUserSecret = async (
  userId: definyFirestoreType.UserId,
  data: Partial<definyFirestoreType.UserSecret>
) => {
  await UserSecretCollection.doc(userId).update(data);
};

/**
 * 全てのユーザーのデータを取得する
 */
export const getAllUser = async (): Promise<ReadonlyArray<{
  id: definyFirestoreType.UserId;
  data: definyFirestoreType.User;
}>> =>
  (await userCollection.get()).docs.map(doc => ({
    id: doc.id as definyFirestoreType.UserId,
    data: doc.data()
  }));

export const searchUserByLogInServiceAndId = async (
  logInServiceAndId: definyFirestoreType.LogInServiceAndId
): Promise<{
  id: definyFirestoreType.UserId;
  data: definyFirestoreType.UserSecret;
}> => {
  const doc = (
    await UserSecretCollection.where(
      "logInServiceAndId",
      "==",
      logInServiceAndId
    ).get()
  ).docs[0];

  return {
    id: doc.id as definyFirestoreType.UserId,
    data: doc.data()
  };
};
/**
 * Firebase Cloud Storage にファイルを保存する
 * @returns ハッシュ値
 */
export const saveFile = async (
  buffer: Buffer,
  mimeType: string
): Promise<string> => {
  const hash = type.createHashFromBuffer(buffer, mimeType);
  const file = storageDefaultBucket.file(hash);
  await file.save(buffer, { contentType: mimeType });
  return hash;
};

/**
 * Firebase Cloud Storageからファイルを読み込むReadable Streamを取得する
 * @param fileHash ファイルハッシュ
 */
export const getReadableStream = (
  fileHash: definyFirestoreType.FileHash
): stream.Readable => {
  return storageDefaultBucket.file(fileHash).createReadStream();
};
/* ==========================================
            Access Token
   ==========================================
*/
type AccessTokenData = {
  readonly userId: definyFirestoreType.UserId;
  readonly issuedAt: FirebaseFirestore.Timestamp;
};

export const createAndWriteAccessToken = async (
  accessTokenHash: definyFirestoreType.AccessTokenHash,
  data: AccessTokenData
): Promise<void> => {
  await accessTokenCollection.doc(accessTokenHash).create(data);
};

export const verifyAccessToken = async (
  accessTokenHash: definyFirestoreType.AccessTokenHash
): Promise<definyFirestoreType.UserId> => {
  const data = (
    await accessTokenCollection.doc(accessTokenHash).get()
  ).data() as undefined | AccessTokenData;
  if (data === undefined) {
    throw new Error("invalid access token");
  }
  if (
    data.issuedAt.toMillis() + 1000 * 60 * 60 * 6 < // 6時間
    new Date().getTime()
  ) {
    throw new Error("access token has expired");
  }
  return data.userId;
};
/* ==========================================
                Log In
   ==========================================
*/
/**
 * ソーシャルログイン stateを保存する
 */
export const writeGoogleLogInState = async (
  logInService: definyFirestoreType.SocialLoginService,
  state: string
): Promise<void> => {
  await collectionFromLogInState(logInService)
    .doc(state)
    .create({ createdAt: getNowTimestamp() });
};

/**
 * ソーシャルログイン stateが存在することを確認し、存在するなら削除する
 */
export const existsGoogleStateAndDeleteAndGetUserId = async (
  logInService: definyFirestoreType.SocialLoginService,
  state: string
): Promise<boolean> => {
  const docRef = collectionFromLogInState(logInService).doc(state);
  const data = (await docRef.get()).data();
  if (data === undefined) {
    return false;
  }
  await docRef.delete();
  return true;
};

/* ==========================================
                Project
   ==========================================
*/

export const addProject = async (
  data: definyFirestoreType.Project
): Promise<definyFirestoreType.ProjectId> => {
  const projectId = type.createRandomId() as definyFirestoreType.ProjectId;
  await projectCollection.doc(projectId).create(data);
  return projectId;
};

/**
 * Idで指定したプロジェクトのデータを取得する
 */
export const getProject = async (
  projectId: definyFirestoreType.ProjectId
): Promise<definyFirestoreType.Project> => {
  const projectData = (await projectCollection.doc(projectId).get()).data();
  if (projectData === undefined) {
    throw new Error(`There was no project with projectId = ${projectId}`);
  }
  return projectData;
};

/**
 * プロジェクトのデータを変更する
 */
export const updateProject = async (
  projectId: definyFirestoreType.ProjectId,
  projectData: Partial<definyFirestoreType.Project>
): Promise<void> => {
  await projectCollection.doc(projectId).update(projectData);
};

/**
 * 全てのプロジェクトのデータを取得する
 */
export const getAllProject = async (): Promise<ReadonlyArray<{
  id: definyFirestoreType.ProjectId;
  data: definyFirestoreType.Project;
}>> =>
  (await projectCollection.get()).docs.map(doc => ({
    id: doc.id as definyFirestoreType.ProjectId,
    data: doc.data()
  }));

/* ==========================================
                Branch
   ==========================================
*/
/**
 * ブランチを作成する
 * @param data
 */
export const addBranch = async (
  id: definyFirestoreType.BranchId,
  data: definyFirestoreType.Branch
): Promise<void> => {
  await branchCollection.doc(id).create(data);
};

/**
 * ブランチを取得する
 */
export const getBranch = async (
  id: definyFirestoreType.BranchId
): Promise<definyFirestoreType.Branch> => {
  const branchData = (await branchCollection.doc(id).get()).data();
  if (branchData === undefined) {
    throw new Error(`There was no branch with branchId = ${id}`);
  }
  return branchData;
};

/**
 * ブランチを更新する
 */
export const updateBranch = async (
  id: definyFirestoreType.BranchId,
  data: Partial<definyFirestoreType.Branch>
): Promise<void> => {
  await branchCollection.doc(id).update(data);
};
/* ==========================================
                Commit
   ==========================================
*/

/**
 * コミットを作成する。存在するものをさらに作成したらエラー
 */
export const addCommit = async (
  data: definyFirestoreType.Commit
): Promise<definyFirestoreType.CommitHash> => {
  const hash = type.createHash(data);
  await commitCollection.doc(hash).create(data);
  return hash as definyFirestoreType.CommitHash;
};

/**
 * コミットを取得する
 */
export const getCommit = async (
  hash: definyFirestoreType.CommitHash
): Promise<definyFirestoreType.Commit> => {
  const commitData = (await commitCollection.doc(hash).get()).data();
  if (commitData === undefined) {
    throw new Error(`There was no commit with commitHash = ${hash}`);
  }
  return commitData;
};
/* ==========================================
                Draft Commit
   ==========================================
*/
/**
 * ドラフトコミットを作成する。存在するものをさらに作成したらエラー
 */
export const addDraftCommit = async (
  data: definyFirestoreType.DraftCommit
): Promise<definyFirestoreType.DraftCommitHash> => {
  const hash = type.createHash(data);
  await draftCommitCollection.doc(hash).create(data);
  return hash as definyFirestoreType.DraftCommitHash;
};

/**
 * ドラフトコミットを取得する
 */
export const getDraftCommit = async (
  hash: definyFirestoreType.DraftCommitHash
): Promise<definyFirestoreType.DraftCommit> => {
  const commitData = (await draftCommitCollection.doc(hash).get()).data();
  if (commitData === undefined) {
    throw new Error(`There was no draft commit with draftCommitHash = ${hash}`);
  }
  return commitData;
};

/**
 * モジュールのスナップショットを作成する。存在するものをさらに追加しようとしたら何もしない。
 */
export const addModuleSnapshot = async (
  data: definyFirestoreType.ModuleSnapshot
): Promise<definyFirestoreType.ModuleSnapshotHash> => {
  const hash = type.createHash(data) as definyFirestoreType.ModuleSnapshotHash;
  if ((await moduleCollection.doc(hash).get()).exists) {
    return hash;
  }
  await moduleCollection.doc(hash).create(data);
  return hash;
};

/**
 * モジュールのスナップショットを取得する
 */
export const getModuleSnapshot = async (
  hash: definyFirestoreType.ModuleSnapshotHash
): Promise<definyFirestoreType.ModuleSnapshot> => {
  const moduleData = (await moduleCollection.doc(hash).get()).data();
  if (moduleData === undefined) {
    throw new Error(`There was no module snapshot with hash = ${hash}`);
  }
  return moduleData;
};

/* ==========================================
                Type Def Snapshot
   ==========================================
*/

/**
 * 型定義のスナップショットを作成する。存在するものをさらに追加しようとしたら何もしない。
 */
export const addTypeDefSnapshot = async (
  data: definyFirestoreType.TypeDefSnapshot
): Promise<definyFirestoreType.TypeDefSnapshotHash> => {
  const hash = type.createHash(data) as definyFirestoreType.TypeDefSnapshotHash;
  if ((await typeCollection.doc(hash).get()).exists) {
    return hash;
  }
  await typeCollection.doc(hash).create(data);
  return hash;
};

/**
 * 型定義のスナップショットを取得する
 */
export const getTypeDefSnapshot = async (
  hash: definyFirestoreType.TypeDefSnapshotHash
): Promise<definyFirestoreType.TypeDefSnapshot> => {
  const typeDefSnapshot = (await typeCollection.doc(hash).get()).data();
  if (typeDefSnapshot === undefined) {
    throw new Error(`There was no typeDef snapshot with hash = ${hash}`);
  }
  return typeDefSnapshot;
};
/* ==========================================
                Part Def Snapshot
   ==========================================
*/

/**
 * パーツ定義のスナップショットを作成する。存在するものをさらに追加しようとしたら何もしない。
 */
export const addPartDefSnapshot = async (
  data: definyFirestoreType.PartDefSnapshot
): Promise<definyFirestoreType.PartDefSnapshotHash> => {
  const hash = type.createHash(data) as definyFirestoreType.PartDefSnapshotHash;
  if ((await partCollection.doc(hash).get()).exists) {
    return hash;
  }
  await partCollection.doc(hash).create(data);
  return hash;
};

/**
 * パーツ定義のスナップショットを取得する
 */
export const getPartDefSnapShot = async (
  hash: definyFirestoreType.PartDefSnapshotHash
): Promise<definyFirestoreType.PartDefSnapshot> => {
  const partDefSnapshot = (await partCollection.doc(hash).get()).data();
  if (partDefSnapshot === undefined) {
    throw new Error(`There was no partDef snapshot with hash = ${hash}`);
  }
  return partDefSnapshot;
};
/* ==========================================
                Timestamp
   ==========================================
*/
/**
 * 今の時刻のタイムスタンプを得る
 */
export const getNowTimestamp = (): firestore.Timestamp =>
  admin.firestore.Timestamp.now();
