import React, { useState, useEffect } from 'react';
import { UserProfile, UserStatus } from '../types';
import { Button } from '../components/Button';
import { auth, db } from '../lib/firebase';
import { deleteUser } from 'firebase/auth';
import { uploadUserFile, downloadUserFile, UserFile, getUserFiles } from '../services/fileService';
import { firestore } from '../services/firestoreService';

interface ProfileViewProps {
  user: UserProfile;
  onLogout: () => void;
  onProfileUpdate?: (updated: Partial<UserProfile>) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ user, onLogout, onProfileUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email || '');
  const [photoFileName, setPhotoFileName] = useState(user.photoFileName || '');
  const [userFiles, setUserFiles] = useState<UserFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    if (!auth?.currentUser) return;
    try {
      const files = await getUserFiles(auth.currentUser.uid);
      setUserFiles(files);
    } catch (err) {
      console.error("Failed to fetch user files:", err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    setIsUploading(true);
    setError(null);
    try {
      await uploadUserFile(file);
      await fetchFiles(); // Refresh file list
    } catch (err: any) {
      console.error(err);
      setError('File upload failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsUploading(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleFileDownload = async (fileId: string) => {
    try {
      await downloadUserFile(fileId);
    } catch (err: any) {
      console.error(err);
      setError('File download failed: ' + (err.message || 'Unknown error'));
    }
  };

  const handleUpdate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const uid = auth?.currentUser?.uid;
      if (!uid) throw new Error("No authenticated user sequence found.");

      const updates = { name, email, photoFileName };
      
      await firestore.users.update(uid, updates, uid);

      if (onProfileUpdate) {
        onProfileUpdate(updates);
      }
      setIsEditing(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to update user profile parameters.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm("WARNING: Irreversible action. Are you sure you wish to permanently terminate your account?")) {
      return;
    }
    
    setIsLoading(true);
    setError(null);
    try {
      const currentUser = auth?.currentUser;
      if (!currentUser) throw new Error("No authenticated user sequence found.");

      const uid = currentUser.uid;
      
      // Attempt to delete DB record first
      await firestore.users.delete(uid, uid);
      // Delete auth user
      await deleteUser(currentUser);
      
      onLogout();
    } catch (err: any) {
      console.error(err);
      setError('Failed to purge account. If you just signed in, try re-authenticating first. ' + err.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="p-8 md:p-12 mb-32 h-full flex items-center justify-center animate-in fade-in duration-500">
      <div className="w-full max-w-2xl bg-white rounded-[3rem] shadow-premium overflow-hidden border border-slate-100">
        <header className="px-10 py-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Identity Core</h2>
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mt-1">Profile Configuration</p>
            </div>
        </header>

        <div className="p-10 space-y-8">
            {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-500 p-4 rounded-2xl text-[11px] font-black uppercase tracking-widest text-center shadow-sm">
                    <i className="fas fa-triangle-exclamation mr-2"></i> {error}
                </div>
            )}

            <div className="flex flex-col md:flex-row gap-10 items-center md:items-start">
                <div className="w-32 h-32 rounded-3xl bg-slate-100 border-4 border-white shadow-xl flex items-center justify-center shrink-0 text-slate-300 relative group overflow-hidden">
                    {photoFileName ? (
                        <div className="absolute inset-0 bg-brand-500 text-white flex items-center justify-center font-black text-2xl uppercase tracking-tighter">
                            {name.charAt(0)}
                        </div>
                    ) : (
                        <div className="absolute inset-0 bg-slate-800 text-brand-400 flex items-center justify-center font-black text-4xl uppercase tracking-tighter">
                            {name.charAt(0)}
                        </div>
                    )}
                </div>

                <div className="flex-1 space-y-5 w-full">
                    {!isEditing ? (
                        <div className="space-y-6 bg-slate-50 p-8 rounded-3xl border border-slate-100">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Assigned Name</label>
                                <p className="text-xl font-bold text-slate-800">{name}</p>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Primary Uplink (Email)</label>
                                <p className="text-lg font-bold text-slate-700">{email || 'UNASSIGNED'}</p>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Avatar Signature</label>
                                <p className="text-sm font-bold text-slate-600">{photoFileName || 'NONE'}</p>
                            </div>
                            <div className="flex gap-4 pt-4 border-t border-slate-200">
                                <Button 
                                    onClick={() => setIsEditing(true)} 
                                    className="bg-brand-500 hover:bg-brand-600 font-bold uppercase tracking-widest text-xs px-6 py-3 rounded-2xl shadow-glow"
                                >
                                    Modify Matrix
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-5 bg-white p-2">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-2">Assigned Name</label>
                                <input 
                                    className="w-full text-sm font-bold p-4 bg-slate-50 rounded-2xl border border-slate-200 focus:border-brand-500 outline-none transition-colors"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-2">Primary Uplink (Email)</label>
                                <input 
                                    className="w-full text-sm font-bold p-4 bg-slate-50 rounded-2xl border border-slate-200 focus:border-brand-500 outline-none transition-colors"
                                    value={email}
                                    type="email"
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2 px-2">Avatar Signature</label>
                                <input 
                                    className="w-full text-sm font-bold p-4 bg-slate-50 rounded-2xl border border-slate-200 focus:border-brand-500 outline-none transition-colors"
                                    value={photoFileName}
                                    placeholder="e.g. avatar.png"
                                    onChange={(e) => setPhotoFileName(e.target.value)}
                                />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <Button 
                                    onClick={handleUpdate} 
                                    isLoading={isLoading}
                                    className="flex-1 bg-brand-500 hover:bg-brand-600 font-bold uppercase tracking-widest text-xs h-14 rounded-2xl shadow-glow"
                                >
                                    Commit Changes
                                </Button>
                                <Button 
                                    onClick={() => setIsEditing(false)} 
                                    variant="secondary"
                                    disabled={isLoading}
                                    className="font-bold uppercase tracking-widest text-xs h-14 px-8 rounded-2xl"
                                >
                                    Abort
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="border-t border-slate-100 pt-8 mt-10">
                <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mb-6">Secured File Uploads</h3>
                
                <div className="space-y-4">
                  {userFiles.map(file => (
                    <div key={file.id} className="flex justify-between items-center p-4 bg-slate-50 border border-slate-100 rounded-2xl group hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-400">
                           <i className={`fas fa-file${file.type.includes('image') ? '-image' : file.type.includes('pdf') ? '-pdf' : '-alt'}`}></i>
                        </div>
                        <div>
                          <p className="font-bold text-sm text-slate-800">{file.name}</p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                             {(file.size / 1024).toFixed(1)} KB • {new Date(file.uploadedAt?.toMillis?.() || Date.now()).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => handleFileDownload(file.id)}
                        className="w-10 h-10 flex items-center justify-center rounded-xl text-brand-500 bg-white border border-slate-200 shadow-sm opacity-0 group-hover:opacity-100 hover:bg-brand-500 hover:text-white transition-all transform scale-95 group-hover:scale-100 cursor-pointer"
                        title="Download Data Matrix"
                      >
                         <i className="fas fa-download"></i>
                      </button>
                    </div>
                  ))}
                  
                  {userFiles.length === 0 && (
                     <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">No files synced to current matrix</p>
                     </div>
                  )}

                  <div className="relative mt-4">
                    <input 
                      type="file" 
                      onChange={handleFileUpload} 
                      disabled={isUploading}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <Button 
                      variant="secondary"
                      disabled={isUploading}
                      className="w-full h-14 rounded-2xl font-black uppercase tracking-[0.3em] flex items-center justify-center pointer-events-none"
                    >
                      {isUploading ? (
                        <><i className="fas fa-circle-notch fa-spin mr-3 text-brand-500"></i> Syncing to Matrix...</>
                      ) : (
                        <><i className="fas fa-cloud-upload-alt mr-3"></i> Upload New File</>
                      )}
                    </Button>
                  </div>
                </div>
            </div>

            <div className="border-t border-slate-100 pt-8 mt-10">
                <Button 
                    onClick={handleDeleteAccount}
                    isLoading={isLoading}
                    variant="danger"
                    className="w-full rounded-2xl h-14 font-black uppercase tracking-[0.3em]"
                >
                    <i className="fas fa-skull text-lg mr-3"></i> Terminate Account
                </Button>
            </div>
        </div>
      </div>
    </div>
  );
};
