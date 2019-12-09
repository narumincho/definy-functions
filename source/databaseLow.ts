import * as admin from "firebase-admin";
import * as type from "./type";
import * as firestore from "@google-cloud/firestore";
import * as stream from "stream";
import * as firestoreType from "definy-firestore-type";
import * as typedFirestore from "typed-firestore";

const app = admin.initializeApp();

const dataBase = (app.firestore() as unknown) as typedFirestore.TypedFirebaseFirestore<
  firestoreType.Firestore
>;
const storageDefaultBucket = app.storage().bucket();

const userCollection = dataBase.collection("user");
const accessTokenCollection = dataBase.collection("accessToken");
const collectionFromLogInState = (
  logInService: firestoreType.SocialLoginService
): typedFirestore.TypedCollectionReference<{
  doc: firestoreType.State;
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
  userId: firestoreType.UserId,
  userData: firestoreType.User
): Promise<firestoreType.UserId> => {
  await userCollection.doc(userId).create(userData);
  return userId;
};

/**
 * ユーザーのデータを取得する
 * @param userId
 */
export const getUser = async (
  userId: firestoreType.UserId
): Promise<firestoreType.User> => {
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
  userId: firestoreType.UserId,
  data: Partial<firestoreType.User>
): Promise<void> => {
  await userCollection.doc(userId).update(data);
};

/**
 * 全てのユーザーのデータを取得する
 */
export const getAllUser = async (): Promise<ReadonlyArray<{
  id: firestoreType.UserId;
  data: firestoreType.User;
}>> =>
  (await userCollection.get()).docs.map(doc => ({
    id: doc.id as firestoreType.UserId,
    data: doc.data()
  }));

export const searchUsers = async <T extends keyof firestoreType.User>(
  filed: T,
  operator: firestore.WhereFilterOp,
  value: firestoreType.User[T]
): Promise<Array<{ id: firestoreType.UserId; data: firestoreType.User }>> =>
  (await userCollection.where(filed, operator, value).get()).docs.map(doc => ({
    id: doc.id as firestoreType.UserId,
    data: doc.data()
  }));

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
  fileHash: firestoreType.FileHash
): stream.Readable => {
  return storageDefaultBucket.file(fileHash).createReadStream();
};
/* ==========================================
            Access Token
   ==========================================
*/
type AccessTokenData = {
  readonly userId: firestoreType.UserId;
  readonly issuedAt: FirebaseFirestore.Timestamp;
};

export const createAndWriteAccessToken = async (
  accessTokenHash: firestoreType.AccessTokenHash,
  data: AccessTokenData
): Promise<void> => {
  await accessTokenCollection.doc(accessTokenHash).create(data);
};

export const verifyAccessToken = async (
  accessTokenHash: firestoreType.AccessTokenHash
): Promise<firestoreType.UserId> => {
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
  logInService: firestoreType.SocialLoginService,
  state: string
): Promise<void> => {
  await collectionFromLogInState(logInService)
    .doc(state)
    .create({});
};

/**
 * ソーシャルログイン stateが存在することを確認し、存在するなら削除する
 */
export const existsGoogleStateAndDeleteAndGetUserId = async (
  logInService: firestoreType.SocialLoginService,
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
  data: firestoreType.Project
): Promise<firestoreType.ProjectId> => {
  const projectId = type.createRandomId() as firestoreType.ProjectId;
  await projectCollection.doc(projectId).create(data);
  return projectId;
};

/**
 * Idで指定したプロジェクトのデータを取得する
 */
export const getProject = async (
  projectId: firestoreType.ProjectId
): Promise<firestoreType.Project> => {
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
  projectId: firestoreType.ProjectId,
  projectData: Partial<firestoreType.Project>
): Promise<void> => {
  await projectCollection.doc(projectId).update(projectData);
};

/**
 * 全てのプロジェクトのデータを取得する
 */
export const getAllProject = async (): Promise<ReadonlyArray<{
  id: firestoreType.ProjectId;
  data: firestoreType.Project;
}>> =>
  (await projectCollection.get()).docs.map(doc => ({
    id: doc.id as firestoreType.ProjectId,
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
  id: firestoreType.BranchId,
  data: firestoreType.Branch
): Promise<void> => {
  await branchCollection.doc(id).create(data);
};

/**
 * ブランチを取得する
 */
export const getBranch = async (
  id: firestoreType.BranchId
): Promise<firestoreType.Branch> => {
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
  id: firestoreType.BranchId,
  data: Partial<firestoreType.Branch>
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
  data: firestoreType.Commit
): Promise<firestoreType.CommitHash> => {
  const hash = type.createHash(data);
  await commitCollection.doc(hash).create(data);
  return hash as firestoreType.CommitHash;
};

/**
 * コミットを取得する
 */
export const getCommit = async (
  hash: firestoreType.CommitHash
): Promise<firestoreType.Commit> => {
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
  data: firestoreType.DraftCommit
): Promise<firestoreType.DraftCommitHash> => {
  const hash = type.createHash(data);
  await draftCommitCollection.doc(hash).create(data);
  return hash as firestoreType.DraftCommitHash;
};

/**
 * ドラフトコミットを取得する
 */
export const getDraftCommit = async (
  hash: firestoreType.DraftCommitHash
): Promise<firestoreType.DraftCommit> => {
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
  data: firestoreType.ModuleSnapshot
): Promise<firestoreType.ModuleSnapshotHash> => {
  const hash = type.createHash(data) as firestoreType.ModuleSnapshotHash;
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
  hash: firestoreType.ModuleSnapshotHash
): Promise<firestoreType.ModuleSnapshot> => {
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
  data: firestoreType.TypeDefSnapshot
): Promise<firestoreType.TypeDefSnapshotHash> => {
  const hash = type.createHash(data) as firestoreType.TypeDefSnapshotHash;
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
  hash: firestoreType.TypeDefSnapshotHash
): Promise<firestoreType.TypeDefSnapshot> => {
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
  data: firestoreType.PartDefSnapshot
): Promise<firestoreType.PartDefSnapshotHash> => {
  const hash = type.createHash(data) as firestoreType.PartDefSnapshotHash;
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
  hash: firestoreType.PartDefSnapshotHash
): Promise<firestoreType.PartDefSnapshot> => {
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
