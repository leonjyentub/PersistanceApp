import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { Stack } from "expo-router";
import * as SQLite from "expo-sqlite";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type Note = {
  id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

const db = SQLite.openDatabaseSync("notes.db");
const NOTE_BACKUP_PATH = `${FileSystem.documentDirectory}latest-note.txt`;
const USERNAME_KEY = "username";

const lessonSteps = [
  "AsyncStorage: 儲存使用者設定，只能存字串。",
  "FileSystem: 將最新筆記備份成 app 沙盒中的文字檔。",
  "SQLite: 建立 notes 表，完成新增、查詢、修改、刪除。",
  "UI 同步: DB 更新後重新 SELECT，再 setState 顯示畫面。",
];

export default function Index() {
  const [isReady, setIsReady] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [username, setUsername] = useState("Leo");
  const [savedUsername, setSavedUsername] = useState("");
  const [backupText, setBackupText] = useState("");
  const [status, setStatus] = useState("App 啟動中，準備初始化資料庫...");

  const isEditing = selectedNote !== null;

  const sortedNotes = useMemo(
    () =>
      [...notes].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [notes]
  );

  useEffect(() => {
    const startApp = async () => {
      try {
        await initDatabase();
        await loadSetting();
        await refreshNotes();
        await readBackupFile();
        setStatus("初始化完成：CREATE TABLE → SELECT → setState");
      } catch (error) {
        console.error(error);
        setStatus("初始化失敗，請查看 console.log。");
      } finally {
        setIsReady(true);
      }
    };

    startApp();
  }, []);

  const initDatabase = async () => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  };

  const loadSetting = async () => {
    const value = await AsyncStorage.getItem(USERNAME_KEY);

    if (value) {
      setUsername(value);
      setSavedUsername(value);
    }
  };

  const saveSetting = async () => {
    try {
      await AsyncStorage.setItem(USERNAME_KEY, username.trim() || "未命名");
      const value = await AsyncStorage.getItem(USERNAME_KEY);
      setSavedUsername(value ?? "");
      setStatus("AsyncStorage 完成：setItem → getItem → setState");
    } catch (error) {
      console.error(error);
      Alert.alert("設定儲存失敗", "請查看 console.log。");
    }
  };

  const refreshNotes = async () => {
    const data = await db.getAllAsync<Note>(
      "SELECT * FROM notes ORDER BY updated_at DESC"
    );
    setNotes(data);
  };

  const readOneNote = async (id: number) => {
    const note = await db.getFirstAsync<Note>(
      "SELECT * FROM notes WHERE id = ?",
      [id]
    );

    setSelectedNote(note);
    setTitle(note?.title ?? "");
    setContent(note?.content ?? "");
    setStatus(`Read 單筆完成：SELECT WHERE id = ${id}`);
  };

  const resetForm = () => {
    setSelectedNote(null);
    setTitle("");
    setContent("");
  };

  const saveNote = async () => {
    const nextTitle = title.trim();
    const nextContent = content.trim();

    if (!nextTitle || !nextContent) {
      Alert.alert("請輸入完整筆記", "標題與內容都需要填寫。");
      return;
    }

    try {
      const now = new Date().toISOString();

      if (selectedNote) {
        await db.runAsync(
          "UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?",
          [nextTitle, nextContent, now, selectedNote.id]
        );
        setStatus("Update 完成：UPDATE → refresh → setState");
      } else {
        await db.runAsync(
          "INSERT INTO notes (title, content, created_at, updated_at) VALUES (?, ?, ?, ?)",
          [nextTitle, nextContent, now, now]
        );
        setStatus("Create 完成：INSERT → refresh → setState");
      }

      await FileSystem.writeAsStringAsync(
        NOTE_BACKUP_PATH,
        `${nextTitle}\n\n${nextContent}`
      );
      await readBackupFile();
      await refreshNotes();
      resetForm();
    } catch (error) {
      console.error(error);
      Alert.alert("筆記儲存失敗", "請查看 console.log。");
    }
  };

  const deleteNote = async (id: number) => {
    try {
      await db.runAsync("DELETE FROM notes WHERE id = ?", [id]);
      await refreshNotes();

      if (selectedNote?.id === id) {
        resetForm();
      }

      setStatus("Delete 完成：DELETE → refresh → setState");
    } catch (error) {
      console.error(error);
      Alert.alert("刪除失敗", "請查看 console.log。");
    }
  };

  const readBackupFile = async () => {
    const info = await FileSystem.getInfoAsync(NOTE_BACKUP_PATH);

    if (!info.exists) {
      setBackupText("尚未建立備份檔。新增或修改筆記後會自動寫入。");
      return;
    }

    const text = await FileSystem.readAsStringAsync(NOTE_BACKUP_PATH);
    setBackupText(text);
  };

  return (
    <>
      <Stack.Screen options={{ title: "離線筆記 App 教學範例" }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.screen}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.hero}>
            <Text style={styles.kicker}>React Native Expo Persistence</Text>
            <Text style={styles.title}>離線筆記 App</Text>
            <Text style={styles.subtitle}>
              本範例把 AsyncStorage、FileSystem、SQLite 與 CRUD 串在同一個畫面，方便課堂逐段講解。
            </Text>
            <View style={styles.flowRow}>
              <FlowPill label="Input" />
              <Text style={styles.flowArrow}>→</Text>
              <FlowPill label="SQLite" />
              <Text style={styles.flowArrow}>→</Text>
              <FlowPill label="State" />
              <Text style={styles.flowArrow}>→</Text>
              <FlowPill label="UI" />
            </View>
          </View>

          <Section title="本單元學習目標">
            {lessonSteps.map((step) => (
              <Text key={step} style={styles.bullet}>
                • {step}
              </Text>
            ))}
          </Section>

          <Section title="AsyncStorage 設定">
            <Text style={styles.helper}>
              key-value 本地儲存。這裡示範 username 設定：setItem / getItem 都要 await。
            </Text>
            <TextInput
              onChangeText={setUsername}
              placeholder="輸入使用者名稱"
              style={styles.input}
              value={username}
            />
            <PrimaryButton label="儲存設定" onPress={saveSetting} />
            <Text style={styles.result}>
              目前 AsyncStorage 讀到：{savedUsername || "尚未儲存"}
            </Text>
          </Section>

          <Section title="SQLite CRUD">
            <Text style={styles.helper}>
              App 啟動時會先 CREATE TABLE，再 SELECT 全部筆記。新增、修改、刪除後都會 refresh。
            </Text>
            <TextInput
              onChangeText={setTitle}
              placeholder="筆記標題"
              style={styles.input}
              value={title}
            />
            <TextInput
              multiline
              onChangeText={setContent}
              placeholder="筆記內容"
              style={[styles.input, styles.textArea]}
              textAlignVertical="top"
              value={content}
            />
            <View style={styles.actionRow}>
              <PrimaryButton
                label={isEditing ? "更新筆記" : "新增筆記"}
                onPress={saveNote}
              />
              {isEditing ? (
                <SecondaryButton label="取消編輯" onPress={resetForm} />
              ) : null}
            </View>
          </Section>

          <Section title={`筆記列表 (${sortedNotes.length})`}>
            {!isReady ? (
              <Text style={styles.helper}>資料載入中...</Text>
            ) : sortedNotes.length === 0 ? (
              <Text style={styles.empty}>目前沒有資料，先新增第一筆筆記。</Text>
            ) : (
              sortedNotes.map((note) => (
                <View key={note.id} style={styles.noteCard}>
                  <View style={styles.noteHeader}>
                    <Text style={styles.noteTitle}>{note.title}</Text>
                    <Text style={styles.noteId}>#{note.id}</Text>
                  </View>
                  <Text style={styles.noteContent}>{note.content}</Text>
                  <Text style={styles.noteMeta}>
                    updated_at: {formatDateTime(note.updated_at)}
                  </Text>
                  <View style={styles.noteActions}>
                    <SecondaryButton
                      label="Read 單筆"
                      onPress={() => readOneNote(note.id)}
                    />
                    <DangerButton
                      label="Delete"
                      onPress={() => deleteNote(note.id)}
                    />
                  </View>
                </View>
              ))
            )}
          </Section>

          <Section title="FileSystem 備份檔">
            <Text style={styles.helper}>
              路徑：{NOTE_BACKUP_PATH}
            </Text>
            <SecondaryButton label="重新讀取檔案" onPress={readBackupFile} />
            <Text style={styles.backupText}>{backupText}</Text>
          </Section>

          <View style={styles.statusBox}>
            <Text style={styles.statusLabel}>Debug / 狀態</Text>
            <Text style={styles.statusText}>{status}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

function Section({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function FlowPill({ label }: { label: string }) {
  return (
    <View style={styles.flowPill}>
      <Text style={styles.flowText}>{label}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.button, styles.primaryButton]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.button, styles.secondaryButton]}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function DangerButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.button, styles.dangerButton]}>
      <Text style={styles.dangerButtonText}>{label}</Text>
    </Pressable>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F4F7F3",
  },
  container: {
    gap: 14,
    padding: 18,
    paddingBottom: 40,
  },
  hero: {
    backgroundColor: "#17324D",
    borderRadius: 8,
    gap: 10,
    padding: 20,
  },
  kicker: {
    color: "#A7D3BF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0,
  },
  subtitle: {
    color: "#DFE8E2",
    fontSize: 15,
    lineHeight: 22,
  },
  flowRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    paddingTop: 6,
  },
  flowPill: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  flowText: {
    color: "#17324D",
    fontSize: 12,
    fontWeight: "700",
  },
  flowArrow: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D9E2DA",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  sectionTitle: {
    color: "#1D2B22",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0,
  },
  bullet: {
    color: "#314139",
    fontSize: 14,
    lineHeight: 21,
  },
  helper: {
    color: "#5B6C61",
    fontSize: 13,
    lineHeight: 20,
  },
  input: {
    backgroundColor: "#F9FBF8",
    borderColor: "#BCCCBD",
    borderRadius: 8,
    borderWidth: 1,
    color: "#1D2B22",
    fontSize: 15,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textArea: {
    minHeight: 96,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  button: {
    alignItems: "center",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButton: {
    backgroundColor: "#226E5F",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    backgroundColor: "#E8EFE9",
    borderColor: "#C6D4C8",
    borderWidth: 1,
  },
  secondaryButtonText: {
    color: "#234238",
    fontSize: 14,
    fontWeight: "800",
  },
  dangerButton: {
    backgroundColor: "#F7E6E3",
    borderColor: "#EDC4BC",
    borderWidth: 1,
  },
  dangerButtonText: {
    color: "#9C2C1E",
    fontSize: 14,
    fontWeight: "800",
  },
  result: {
    color: "#17324D",
    fontSize: 14,
    fontWeight: "700",
  },
  empty: {
    backgroundColor: "#F9FBF8",
    borderColor: "#D9E2DA",
    borderRadius: 8,
    borderWidth: 1,
    color: "#5B6C61",
    fontSize: 14,
    padding: 12,
  },
  noteCard: {
    backgroundColor: "#F9FBF8",
    borderColor: "#D9E2DA",
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  noteHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  noteTitle: {
    color: "#1D2B22",
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
  },
  noteId: {
    color: "#6B7C70",
    fontSize: 12,
    fontWeight: "700",
  },
  noteContent: {
    color: "#314139",
    fontSize: 14,
    lineHeight: 21,
  },
  noteMeta: {
    color: "#6B7C70",
    fontSize: 12,
  },
  noteActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  backupText: {
    backgroundColor: "#17324D",
    borderRadius: 8,
    color: "#FFFFFF",
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    fontSize: 13,
    lineHeight: 20,
    padding: 12,
  },
  statusBox: {
    backgroundColor: "#1D2B22",
    borderRadius: 8,
    gap: 6,
    padding: 14,
  },
  statusLabel: {
    color: "#A7D3BF",
    fontSize: 12,
    fontWeight: "800",
  },
  statusText: {
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 20,
  },
});
