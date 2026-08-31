import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as api from '../src/api';
import type { MerchantCategory } from '../src/api';
import { BackButton, BACK_BUTTON_WIDTH } from '../src/BackButton';
import { GradientBackground, t } from '../src/theme';
import { useStrings, type Locale } from '../src/i18n';

const S: Record<
  Locale,
  {
    back: string;
    title: string;
    hint: string;
    newBtn: string;
    empty: string;
    shared: string;
    newCategory: string;
    name: string;
    namePlaceholder: string;
    nameRequired: string;
    addPhoto: string;
    changePhoto: string;
    uploadOnSave: string;
    photoHintWeb: string;
    photoHint: string;
    photoSourceTitle: string;
    photoSourceBody: string;
    camera: string;
    gallery: string;
    cameraPermTitle: string;
    cameraPermBody: string;
    photoPermTitle: string;
    photoPermBody: string;
    createdButImageFailed: (message: string) => string;
    imageUploaded: string;
    created: string;
    create: string;
    cancel: string;
    edit: string;
    editCategory: string;
    save: string;
    updated: string;
    updatedButImageFailed: (message: string) => string;
    delete: string;
    deleteConfirm: string;
    deleted: string;
  }
> = {
  es: {
    back: 'Cuenta',
    title: 'Categorías',
    hint: 'Las categorías de productos de tu comercio. Las generales las comparte toda la app.',
    newBtn: '+ Nueva',
    empty: 'Tu comercio todavía no tiene categorías propias. Toca “+ Nueva” para crear la primera.',
    shared: 'General',
    newCategory: 'Nueva categoría',
    name: 'Nombre',
    namePlaceholder: 'Ej: Bebidas frías',
    nameRequired: 'El nombre es requerido.',
    addPhoto: 'Agregar imagen',
    changePhoto: 'Cambiar imagen',
    uploadOnSave: 'Se subirá al guardar',
    photoHintWeb: 'Cuadrada, es lo que ven los clientes',
    photoHint: 'Cámara o galería · cuadrada, es lo que ven los clientes',
    photoSourceTitle: 'Imagen de la categoría',
    photoSourceBody: '¿De dónde la tomamos?',
    camera: 'Cámara',
    gallery: 'Galería',
    cameraPermTitle: 'Permiso de cámara',
    cameraPermBody: 'Activa el permiso de cámara para tomar la foto de la categoría.',
    photoPermTitle: 'Permiso de fotos',
    photoPermBody: 'Activa el permiso de fotos para agregar una imagen.',
    createdButImageFailed: (message) => `La categoría se creó, pero la imagen no: ${message}`,
    imageUploaded: ' Imagen subida.',
    created: 'Categoría creada.',
    create: 'Crear categoría',
    cancel: 'Cancelar',
    edit: 'Editar',
    editCategory: 'Editar categoría',
    save: 'Guardar cambios',
    updated: 'Categoría actualizada.',
    updatedButImageFailed: (message) => `Los cambios se guardaron, pero la imagen no: ${message}`,
    delete: 'Eliminar categoría',
    deleteConfirm: '¿Seguro? Toca de nuevo para eliminar',
    deleted: 'Categoría eliminada.',
  },
  en: {
    back: 'Account',
    title: 'Categories',
    hint: 'Your business’s product categories. General ones are shared by the whole app.',
    newBtn: '+ New',
    empty: 'Your business has no categories of its own yet. Tap “+ New” to create the first one.',
    shared: 'General',
    newCategory: 'New category',
    name: 'Name',
    namePlaceholder: 'E.g. Cold drinks',
    nameRequired: 'The name is required.',
    addPhoto: 'Add image',
    changePhoto: 'Change image',
    uploadOnSave: 'Will be uploaded on save',
    photoHintWeb: 'Square — it is what customers see',
    photoHint: 'Camera or gallery · square, it is what customers see',
    photoSourceTitle: 'Category image',
    photoSourceBody: 'Where should it come from?',
    camera: 'Camera',
    gallery: 'Gallery',
    cameraPermTitle: 'Camera permission',
    cameraPermBody: 'Enable the camera permission to take the category photo.',
    photoPermTitle: 'Photo permission',
    photoPermBody: 'Enable the photo permission to add an image.',
    createdButImageFailed: (message) => `The category was created, but the image was not: ${message}`,
    imageUploaded: ' Image uploaded.',
    created: 'Category created.',
    create: 'Create category',
    cancel: 'Cancel',
    edit: 'Edit',
    editCategory: 'Edit category',
    save: 'Save changes',
    updated: 'Category updated.',
    updatedButImageFailed: (message) => `The changes were saved, but the image was not: ${message}`,
    delete: 'Delete category',
    deleteConfirm: 'Sure? Tap again to delete',
    deleted: 'Category deleted.',
  },
};

// The merchant's product categories (item types), reached from Cuenta. The list is what their
// company can use: its own categories first, then the general ones every merchant shares --
// those are shown read-only, marked with a chip. Creating asks only for a name and an image;
// the popover is a bottom sheet like the product form's translation editor, since two fields
// do not earn a page of their own.
export default function MerchantCategoriesScreen() {
  const router = useRouter();
  const tx = useStrings(S);
  const [categories, setCategories] = useState<MerchantCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The category sheet, doing double duty: creating when `editing` is null, renaming/re-imaging
  // that category otherwise. Its name, the picked-but-not-yet-sent image, and its own error so a
  // refused save shows where it was typed rather than under the list.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<MerchantCategory | null>(null);
  const [name, setName] = useState('');
  const [pickedPhoto, setPickedPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // The delete lives in the edit sheet and confirms in place: first tap arms it, second deletes.
  // (Alert's multi-button confirm does not exist on web, and a nested modal would fight this one.)
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const res = await api.merchantCategories(0, api.CATEGORY_PAGE_SIZE);
    if (!res.success) { setError(res.message); return; }
    setError(null);
    const rows = res.data ?? [];
    setCategories(rows);
    // A short page means the list is exhausted; a full one may have more behind it.
    setHasMore(rows.length === api.CATEGORY_PAGE_SIZE);
  }, []);

  useFocusEffect(useCallback(() => {
    let alive = true;
    load().finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore || loading || refreshing) return;
    setLoadingMore(true);
    const res = await api.merchantCategories(categories.length, api.CATEGORY_PAGE_SIZE);
    setLoadingMore(false);
    if (!res.success) return;
    const rows = res.data ?? [];
    // Deduped by id: a category created or renamed between pages shifts the by-name offsets, and
    // appending a row the list already shows would crash the keyExtractor.
    setCategories((prev) => [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))]);
    setHasMore(rows.length === api.CATEGORY_PAGE_SIZE);
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/account'));

  // Square crop and re-encoded before sending, exactly like a product's photo.
  const photoOptions: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  };

  const applyPicked = (picked: ImagePicker.ImagePickerResult) => {
    if (picked.canceled || !picked.assets?.length) return;
    setPickedPhoto(picked.assets[0]);
    setFormError(null);
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(tx.cameraPermTitle, tx.cameraPermBody);
      return;
    }
    applyPicked(await ImagePicker.launchCameraAsync(photoOptions));
  };

  const pickFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(tx.photoPermTitle, tx.photoPermBody);
      return;
    }
    applyPicked(await ImagePicker.launchImageLibraryAsync(photoOptions));
  };

  // Both sources on a phone; on web the browser's own file dialog already offers the camera,
  // and Alert has no multi-button UI there.
  const pickPhoto = () => {
    if (Platform.OS === 'web') { void pickFromLibrary(); return; }
    Alert.alert(tx.photoSourceTitle, tx.photoSourceBody, [
      { text: tx.camera, onPress: () => { void takePhoto(); } },
      { text: tx.gallery, onPress: () => { void pickFromLibrary(); } },
      { text: tx.cancel, style: 'cancel' },
    ]);
  };

  const openCreate = () => {
    setEditing(null);
    setName('');
    setPickedPhoto(null);
    setFormError(null);
    setNotice(null);
    setConfirmingDelete(false);
    setSheetOpen(true);
  };

  // The same sheet, prefilled with the category as it is; only the merchant's own rows offer it.
  const openEdit = (category: MerchantCategory) => {
    setEditing(category);
    setName(category.name);
    setPickedPhoto(null);
    setFormError(null);
    setNotice(null);
    setConfirmingDelete(false);
    setSheetOpen(true);
  };

  const removeCategory = async () => {
    if (!editing || deleting || saving) return;
    if (!confirmingDelete) { setConfirmingDelete(true); return; }
    setDeleting(true);
    const res = await api.deleteMerchantCategory(editing.id);
    setDeleting(false);
    if (!res.success) { setFormError(res.message); setConfirmingDelete(false); return; }
    setSheetOpen(false);
    // The server's message matters here: a category with products was retired, not erased.
    setNotice(res.message || tx.deleted);
    await load();
  };

  const save = async () => {
    if (!name.trim()) { setFormError(tx.nameRequired); return; }
    setSaving(true);
    setFormError(null);
    const res = editing
      ? await api.updateMerchantCategory(editing.id, { name: name.trim() })
      : await api.createMerchantCategory({ name: name.trim() });
    if (!res.success || !res.data) { setSaving(false); setFormError(res.message); return; }

    // The image goes up after the category exists, since a new one has no id to attach it to.
    // A failed image does not undo the save: the category is real either way, so the sheet
    // closes and the notice says only the image failed.
    let note = '';
    if (pickedPhoto) {
      const up = await api.uploadCategoryImage(
        res.data.id,
        pickedPhoto.uri,
        pickedPhoto.mimeType ?? 'image/jpeg',
        pickedPhoto.fileName ?? 'categoria.jpg',
      );
      note = up.success ? tx.imageUploaded : '';
      if (!up.success) {
        setSaving(false);
        setSheetOpen(false);
        setNotice((editing ? tx.updatedButImageFailed : tx.createdButImageFailed)(up.message));
        await load();
        return;
      }
    }

    setSaving(false);
    setSheetOpen(false);
    setNotice(`${res.message || (editing ? tx.updated : tx.created)}${note}`);
    await load();
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <BackButton onPress={back} label={tx.back} />
          <Text style={styles.title}>{tx.title}</Text>
          <Pressable style={styles.newBtn} onPress={openCreate} accessibilityRole="button">
            <Text style={styles.newBtnText}>{tx.newBtn}</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>{tx.hint}</Text>

        {notice ? (
          <Pressable onPress={() => setNotice(null)}>
            <Text style={styles.notice}>{notice}</Text>
          </Pressable>
        ) : null}

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={t.text} /></View>
        ) : (
          <FlatList
            data={categories}
            keyExtractor={(c) => c.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
            ListEmptyComponent={<Text style={styles.empty}>{tx.empty}</Text>}
            ListFooterComponent={
              loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={t.text} /> : null
            }
            renderItem={({ item }) => (
              <View style={styles.card}>
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={styles.thumb} resizeMode="contain" />
                ) : (
                  <View style={styles.thumb}><Text style={styles.thumbEmoji}>🏷️</Text></View>
                )}
                <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
                {/* Only the shared rows wear a chip: the merchant's own need no badge saying so.
                    Their own get the edit button instead -- shared rows are read-only here. */}
                {item.owned ? (
                  <Pressable
                    style={styles.editBtn}
                    onPress={() => openEdit(item)}
                    accessibilityRole="button"
                    accessibilityLabel={tx.edit}
                  >
                    <Text style={styles.editBtnText}>✏️ {tx.edit}</Text>
                  </Pressable>
                ) : (
                  <View style={styles.chip}><Text style={styles.chipText}>{tx.shared}</Text></View>
                )}
              </View>
            )}
          />
        )}

        {/* Create/edit popover -- the same bottom-sheet shape the product form's translation editor uses. */}
        <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable style={styles.scrim} onPress={() => !saving && setSheetOpen(false)}>
              <Pressable style={styles.sheet} onPress={() => {}}>
                <Text style={styles.sheetTitle}>{editing ? tx.editCategory : tx.newCategory}</Text>

                {/* While editing, the current image stands in until a new one is picked, so the
                    sheet shows the category as it is rather than an empty camera slot. */}
                <Pressable style={styles.photoRow} onPress={pickPhoto} accessibilityRole="button">
                  {pickedPhoto || editing?.imageUrl ? (
                    <Image source={{ uri: pickedPhoto?.uri ?? editing?.imageUrl ?? undefined }} style={styles.photo} resizeMode="contain" />
                  ) : (
                    <View style={[styles.photo, styles.photoEmpty]}><Text style={styles.photoEmoji}>📷</Text></View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.photoTitle}>{pickedPhoto || editing?.imageUrl ? tx.changePhoto : tx.addPhoto}</Text>
                    <Text style={styles.photoSub}>
                      {pickedPhoto
                        ? tx.uploadOnSave
                        : Platform.OS === 'web' ? tx.photoHintWeb : tx.photoHint}
                    </Text>
                  </View>
                </Pressable>

                <Text style={styles.label}>{tx.name}</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder={tx.namePlaceholder}
                  placeholderTextColor={t.textFaint}
                />

                {formError ? <Text style={styles.error}>{formError}</Text> : null}

                <Pressable style={[styles.primary, saving && styles.disabled]} disabled={saving} onPress={save}>
                  {saving
                    ? <ActivityIndicator color={t.onAccent} />
                    : <Text style={styles.primaryText}>{editing ? tx.save : tx.create}</Text>}
                </Pressable>
                {editing ? (
                  <Pressable
                    style={[styles.danger, confirmingDelete && styles.dangerArmed, (saving || deleting) && styles.disabled]}
                    disabled={saving || deleting}
                    onPress={removeCategory}
                    accessibilityRole="button"
                  >
                    {deleting
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.dangerText}>{confirmingDelete ? tx.deleteConfirm : `🗑️ ${tx.delete}`}</Text>}
                  </Pressable>
                ) : null}
                <Pressable onPress={() => setSheetOpen(false)} disabled={saving || deleting}>
                  <Text style={styles.cancel}>{tx.cancel}</Text>
                </Pressable>
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  title: { fontSize: 18, fontWeight: '900', color: t.text },
  newBtn: { backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minWidth: BACK_BUTTON_WIDTH, alignItems: 'center' },
  newBtnText: { color: t.onAccent, fontWeight: '900', fontSize: 13 },
  hint: { color: t.textMuted, fontSize: 13, fontWeight: '600', lineHeight: 18, paddingHorizontal: 16, paddingBottom: 10 },
  notice: { color: '#bbf7d0', fontSize: 13, fontWeight: '700', paddingHorizontal: 16, paddingBottom: 8 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingTop: 4, gap: 10, paddingBottom: 24 },
  error: { color: t.danger, fontSize: 14, marginBottom: 8 },
  empty: { color: t.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40, paddingHorizontal: 24, lineHeight: 20 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 12,
  },
  thumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: t.cardStrong, justifyContent: 'center', alignItems: 'center' },
  thumbEmoji: { fontSize: 22 },
  name: { flex: 1, fontSize: 15, fontWeight: '800', color: t.text },
  chip: { backgroundColor: '#64748b', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  editBtn: { backgroundColor: t.cardStrong, borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  editBtnText: { color: t.text, fontSize: 12, fontWeight: '800' },
  footerSpinner: { paddingVertical: 14 },

  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0b2a6b', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderColor: t.border, padding: 18, paddingBottom: 28, gap: 8,
    maxWidth: 520, width: '100%', alignSelf: 'center',
  },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: t.text, marginBottom: 4 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  photo: { width: 68, height: 68, borderRadius: 12, backgroundColor: t.cardStrong },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.border },
  photoEmoji: { fontSize: 26 },
  photoTitle: { fontSize: 15, fontWeight: '800', color: t.text },
  photoSub: { fontSize: 12, fontWeight: '600', color: t.textMuted, marginTop: 2 },
  label: { fontSize: 13, fontWeight: '700', color: t.textMuted, marginTop: 6 },
  input: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: t.text },
  primary: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  primaryText: { color: t.onAccent, fontSize: 16, fontWeight: '800' },
  danger: { borderWidth: 1, borderColor: '#fca5a5', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  dangerArmed: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  dangerText: { color: '#fecaca', fontSize: 14, fontWeight: '800' },
  cancel: { color: t.textMuted, textAlign: 'center', paddingVertical: 12, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
