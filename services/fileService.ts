import { auth, storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { firestore } from './firestoreService';

export interface UserFile {
  id: string;
  name: string;
  storagePath: string;
  size: number;
  type: string;
  uploadedAt: any;
}

export const getUserFiles = async (uid: string): Promise<UserFile[]> => {
  return (await firestore.userFiles.find(uid)) as UserFile[];
};

export const uploadUserFile = async (file: File): Promise<string> => {
  if (!auth?.currentUser) {
    throw new Error('User not authenticated');
  }
  if (!storage) {
    throw new Error('Storage not initialized');
  }

  const uid = auth.currentUser.uid;
  const fileId = crypto.randomUUID();
  const storagePath = `user_uploads/${uid}/${fileId}_${file.name}`;
  
  // Upload to Storage
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file);

  // Sync Metadata to Firestore
  const metadata = {
    name: file.name,
    storagePath,
    size: file.size,
    type: file.type,
    uploadedAt: Date.now(),
  };
  await firestore.userFiles.set(uid, fileId, metadata);

  return fileId;
};

export const downloadUserFile = async (fileId: string): Promise<void> => {
  if (!auth?.currentUser) {
    throw new Error('User not authenticated');
  }
  if (!storage) {
    throw new Error('Storage not initialized');
  }

  const uid = auth.currentUser.uid;
  
  // Fetch metadata from Firestore
  const metadata = await firestore.userFiles.getById(uid, fileId);
  
  if (!metadata) {
    throw new Error('File metadata not found');
  }
  
  if (!metadata.storagePath) {
    throw new Error('Storage path not found in metadata');
  }

  // Get download URL from Storage
  const storageRef = ref(storage, metadata.storagePath);
  const url = await getDownloadURL(storageRef);

  // Open in new tab
  window.open(url, '_blank');
};
