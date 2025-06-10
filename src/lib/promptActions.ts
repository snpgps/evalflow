
import { collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from '@/hooks/use-toast';
import type { PromptTemplate, PromptVersion } from '@/app/(app)/prompts/page'; // Assuming types are exported from page for now

interface PromptVersionFirestore { // Raw from Firestore
  versionNumber: number;
  template: string;
  notes: string;
  createdAt: Timestamp;
}

interface PromptTemplateFirestore { // Raw from Firestore
  name: string;
  description: string;
  currentVersionId: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Fetch Prompt Templates with Versions
export const fetchPromptTemplates = async (userId: string | null): Promise<PromptTemplate[]> => {
  if (!userId) return [];
  try {
    const promptTemplatesCollectionRef = collection(db, 'users', userId, 'promptTemplates');
    const q = query(promptTemplatesCollectionRef, orderBy('createdAt', 'desc'));
    const promptTemplatesSnapshot = await getDocs(q);

    if (promptTemplatesSnapshot.empty) {
        return [];
    }

    const promptTemplatesData: PromptTemplate[] = [];

    for (const promptDoc of promptTemplatesSnapshot.docs) {
      const promptData = promptDoc.data() as PromptTemplateFirestore;
      const versionsCollectionRef = collection(db, 'users', userId, 'promptTemplates', promptDoc.id, 'versions');
      const versionsQuery = query(versionsCollectionRef, orderBy('versionNumber', 'desc'));
      const versionsSnapshot = await getDocs(versionsQuery);

      const versions: PromptVersion[] = [];
      versionsSnapshot.forEach(versionDocSnap => {
        const versionData = versionDocSnap.data() as PromptVersionFirestore;
        const versionCreatedAtTimestamp = versionData.createdAt as Timestamp | undefined;
        versions.push({
          id: versionDocSnap.id,
          versionNumber: versionData.versionNumber || 0,
          template: versionData.template || '',
          notes: versionData.notes || '',
          createdAt: versionCreatedAtTimestamp?.toDate().toISOString() || new Date(0).toISOString(),
        });
      });

      const createdAtTimestamp = promptData.createdAt as Timestamp | undefined;
      const updatedAtTimestamp = promptData.updatedAt as Timestamp | undefined;

      promptTemplatesData.push({
        id: promptDoc.id,
        name: promptData.name || 'Untitled Prompt',
        description: promptData.description || '',
        versions: versions,
        currentVersionId: promptData.currentVersionId || null,
        createdAt: createdAtTimestamp?.toDate().toISOString(),
        updatedAt: updatedAtTimestamp?.toDate().toISOString(),
      });
    }
    return promptTemplatesData;
  } catch (error) {
    console.error("Error fetching prompt templates:", error);
    toast({ title: "Error", description: "Could not fetch prompt templates.", variant: "destructive" });
    return [];
  }
};
