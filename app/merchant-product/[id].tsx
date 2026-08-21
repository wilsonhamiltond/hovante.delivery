import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as api from '../../src/api';
import { setFlash } from '../../src/flash';
import { BackButton, BACK_BUTTON_WIDTH } from '../../src/BackButton';
import { GradientBackground, t } from '../../src/theme';

// The locales a translation can be written in. Spanish is the base language -- the product's own
// name and description above -- so it is deliberately not offered (mirrors the ERP's editor).
const LOCALES = [
  { code: 'en', label: 'Inglés (en)' },
  { code: 'fr', label: 'Francés (fr)' },
];
const localeLabel = (code: string) => LOCALES.find((l) => l.code === code)?.label ?? code;

// The merchant's add/edit product form as its own page, reached from the Productos list. `id` is
// "new" when creating; when editing, the product's current fields ride along as route params --
// there is no single-product read for merchants, and the list already holds everything the form
// shows. On web those params live in the URL, so a refresh keeps the form filled.
export default function MerchantProductFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string; name?: string; description?: string; price?: string; active?: string; imageUrl?: string;
  }>();
  const creating = params.id === 'new';

  // The id being written to. Starts as the route's (none while creating), and adopts the created
  // product's id if the save lands but its photo does not -- the retry must update, not create a
  // second product.
  const [productId, setProductId] = useState<string | null>(creating ? null : params.id);

  const [name, setName] = useState(creating ? '' : params.name ?? '');
  const [description, setDescription] = useState(creating ? '' : params.description ?? '');
  const [price, setPrice] = useState(creating ? '' : params.price ?? '');
  const [active, setActive] = useState(creating ? true : params.active !== 'false');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // The photo. `photoUrl` is what the product already has (or what an upload just returned);
  // `pickedPhoto` is a local file waiting to be sent, which only happens once the product exists
  // -- a new one has no id to attach an image to until it is saved.
  const [photoUrl, setPhotoUrl] = useState<string | null>(creating ? null : params.imageUrl ?? null);
  const [pickedPhoto, setPickedPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);

  // The product's translations (en/fr), and the popover that adds or edits ONE of them. Each saves
  // through its own endpoint the moment its button is pressed -- independent of the main save --
  // because translations hang off an id, which is also why a still-unsaved product has none.
  const [translations, setTranslations] = useState<api.ProductTranslation[]>([]);
  const [trOpen, setTrOpen] = useState(false);
  // The locale being edited, or null when the popover is adding a new one. Fixed while editing:
  // with no delete on the phone, letting it change would strand the row it was opened from.
  const [trEditing, setTrEditing] = useState<string | null>(null);
  const [trLocale, setTrLocale] = useState(LOCALES[0].code);
  const [trName, setTrName] = useState('');
  const [trDescription, setTrDescription] = useState('');
  const [trSaving, setTrSaving] = useState(false);
  const [trError, setTrError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) return;
    let alive = true;
    api.merchantProductTranslations(productId).then((res) => {
      if (alive && res.success) setTranslations(res.data ?? []);
    });
    return () => { alive = false; };
  }, [productId]);

  const openTrCreate = () => {
    // Preselect the first locale not written yet, so adding cannot silently overwrite one.
    const used = new Set(translations.map((t) => t.locale));
    setTrEditing(null);
    setTrLocale(LOCALES.find((l) => !used.has(l.code))?.code ?? LOCALES[0].code);
    setTrName(''); setTrDescription('');
    setTrError(null);
    setTrOpen(true);
  };

  const openTrEdit = (tr: api.ProductTranslation) => {
    setTrEditing(tr.locale);
    setTrLocale(tr.locale);
    setTrName(tr.name); setTrDescription(tr.description ?? '');
    setTrError(null);
    setTrOpen(true);
  };

  const saveTranslation = async () => {
    if (!productId) return;
    if (!trName.trim()) { setTrError('El nombre traducido es requerido.'); return; }
    setTrSaving(true);
    setTrError(null);
    const res = await api.saveMerchantProductTranslation(productId, {
      locale: trLocale,
      name: trName.trim(),
      description: trDescription.trim() || undefined,
    });
    setTrSaving(false);
    if (!res.success || !res.data) { setTrError(res.message); return; }
    // The saved row replaces its locale's entry in place (or joins the list, kept in locale order).
    const row = res.data;
    setTranslations((prev) =>
      [...prev.filter((t) => t.locale !== row.locale), row].sort((a, b) => a.locale.localeCompare(b.locale)));
    setTrOpen(false);
  };

  // Every locale already has a translation: the add button would only offer overwrites.
  const allLocalesUsed = LOCALES.every((l) => translations.some((t) => t.locale === l.code));

  const back = () => (router.canGoBack() ? router.back() : router.replace('/merchant-products'));

  // Asked for a square crop and re-encoded before sending: a modern phone photo is several
  // megabytes, far more than a catalogue thumbnail can show. Shared by both sources so a photo
  // taken with the camera arrives in exactly the same shape as one chosen from the library.
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

  // Take the photo with the camera. This is the common case for a counter adding a product it has
  // in front of it -- the picture does not exist yet, so sending them to the gallery first meant
  // leaving the app to take it and coming back.
  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso de cámara', 'Activa el permiso de cámara para tomar la foto del producto.');
      return;
    }
    applyPicked(await ImagePicker.launchCameraAsync(photoOptions));
  };

  const pickFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso de fotos', 'Activa el permiso de fotos para agregar una imagen.');
      return;
    }
    applyPicked(await ImagePicker.launchImageLibraryAsync(photoOptions));
  };

  // Offer both sources. On web there is nothing to choose between: the browser's own file dialog
  // already exposes the camera on a phone, and Alert has no multi-button UI there -- so the choice
  // would swallow the tap instead of presenting itself.
  const pickPhoto = () => {
    if (Platform.OS === 'web') { void pickFromLibrary(); return; }
    Alert.alert('Foto del producto', '¿De dónde la tomamos?', [
      { text: 'Cámara', onPress: () => { void takePhoto(); } },
      { text: 'Galería', onPress: () => { void pickFromLibrary(); } },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const save = async () => {
    // Accepts "1.250,50" as well as "1250.50": a price typed on a Dominican phone should not be
    // rejected for its separators.
    const parsed = Number(price.replace(/\./g, '').replace(',', '.'));
    if (!name.trim()) { setFormError('El nombre es requerido.'); return; }
    if (!Number.isFinite(parsed) || parsed < 0) { setFormError('Escribe un precio válido.'); return; }

    setSaving(true);
    setFormError(null);
    const input = {
      name: name.trim(),
      description: description.trim() || undefined,
      price: parsed,
      active,
    };
    const res = productId
      ? await api.updateMerchantProduct(productId, input)
      : await api.createMerchantProduct(input);
    if (!res.success) { setSaving(false); setFormError(res.message); return; }

    // The photo goes up after the product is saved, because a new one has no id to attach it to
    // until then. A failed image does not undo the save: the product is real either way, so the
    // form stays open saying only the photo failed.
    let photoNote = '';
    if (pickedPhoto && res.data?.id) {
      const up = await api.uploadProductImage(
        res.data.id,
        pickedPhoto.uri,
        pickedPhoto.mimeType ?? 'image/jpeg',
        pickedPhoto.fileName ?? 'producto.jpg',
      );
      if (!up.success) {
        setSaving(false);
        setProductId(res.data.id);
        setPickedPhoto(null);
        setPhotoUrl(res.data.imageUrl ?? photoUrl);
        setFormError(`El producto se guardó, pero la imagen no: ${up.message}`);
        return;
      }
      photoNote = ' Imagen actualizada.';
    }

    setSaving(false);
    // The list refreshes itself on focus; this hands it the confirmation to show above the rows.
    setFlash(`${res.message || 'Guardado.'}${photoNote}`);
    back();
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <BackButton onPress={back} label="Productos" />
          <Text style={styles.title}>{creating ? 'Nuevo producto' : 'Editar producto'}</Text>
          <View style={{ width: BACK_BUTTON_WIDTH }} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {/* The photo. The whole square is the control -- a small "change" link is a hard target
                on a phone -- and it previews the pick before it is sent. */}
            <Pressable style={styles.photoRow} onPress={pickPhoto} accessibilityRole="button">
              {pickedPhoto || photoUrl ? (
                // The preview shows what the card will show, so it fits the same way.
                <Image source={{ uri: pickedPhoto?.uri ?? photoUrl! }} style={styles.photo} resizeMode="contain" />
              ) : (
                <View style={[styles.photo, styles.photoEmpty]}><Text style={styles.photoEmoji}>📷</Text></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.photoTitle}>
                  {pickedPhoto || photoUrl ? 'Cambiar foto' : 'Agregar foto'}
                </Text>
                <Text style={styles.photoSub}>
                  {pickedPhoto
                    ? 'Se subirá al guardar'
                    // Naming both sources is what makes the camera discoverable: the control looks
                    // the same either way, so nothing else tells them taking one is an option.
                    : Platform.OS === 'web'
                      ? 'Cuadrada, es lo que ven los clientes'
                      : 'Cámara o galería · cuadrada, es lo que ven los clientes'}
                </Text>
              </View>
            </Pressable>

            <Text style={styles.label}>Nombre</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Ej: Cerveza Presidente 650ml"
              placeholderTextColor={t.textFaint}
            />

            <Text style={styles.label}>Descripción (opcional)</Text>
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder="Ej: Botella fría, 650 ml"
              placeholderTextColor={t.textFaint}
            />

            <Text style={styles.label}>Precio (RD$)</Text>
            {/* The numeric keyboard's enter key does nothing by itself: "done" makes it a
                checkmark and the submit handler puts the keyboard away, since the price is the
                last thing typed before the toggle and the save button. */}
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              placeholder="0.00"
              placeholderTextColor={t.textFaint}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />

            <Pressable style={styles.toggleRow} onPress={() => setActive(!active)} accessibilityRole="button">
              <View style={[styles.checkbox, active && styles.checkboxOn]}>
                {active ? <Text style={styles.checkboxTick}>✓</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>En venta</Text>
                <Text style={styles.toggleSub}>
                  {active ? 'Los clientes pueden pedirlo' : 'No aparece en el mercado'}
                </Text>
              </View>
            </Pressable>

            {/* Traducciones: what the product is called in the app's other languages. The rows are
                the saved set; tapping one reopens it in the popover. */}
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Traducciones</Text>
              {productId && !allLocalesUsed ? (
                <Pressable onPress={openTrCreate} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.sectionAction}>+ Agregar</Text>
                </Pressable>
              ) : null}
            </View>
            {!productId ? (
              <Text style={styles.trEmpty}>Guarda el producto primero para agregar traducciones.</Text>
            ) : translations.length === 0 ? (
              <Text style={styles.trEmpty}>
                Sin traducciones. El nombre y la descripción de arriba son la versión en español;
                usa “+ Agregar” para inglés o francés.
              </Text>
            ) : (
              translations.map((tr) => (
                <Pressable key={tr.locale} style={styles.trRow} onPress={() => openTrEdit(tr)} accessibilityRole="button">
                  <View style={styles.trBadge}><Text style={styles.trBadgeText}>{tr.locale.toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.trName} numberOfLines={1}>{tr.name}</Text>
                    {tr.description ? (
                      <Text style={styles.trDesc} numberOfLines={1}>{tr.description}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.trEdit}>✏️</Text>
                </Pressable>
              ))
            )}

            {formError ? <Text style={styles.error}>{formError}</Text> : null}

            <Pressable style={[styles.primary, saving && styles.disabled]} disabled={saving} onPress={save}>
              {saving
                ? <ActivityIndicator color={t.onAccent} />
                : <Text style={styles.primaryText}>{creating && !productId ? 'Crear producto' : 'Guardar cambios'}</Text>}
            </Pressable>
            <Pressable onPress={back} disabled={saving}>
              <Text style={styles.cancel}>Cancelar</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Add / edit translation popover -- the same bottom-sheet shape the list's delete
            confirmation uses. */}
        <Modal visible={trOpen} transparent animationType="slide" onRequestClose={() => setTrOpen(false)}>
          <Pressable style={styles.scrim} onPress={() => setTrOpen(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>
                {trEditing ? `Editar traducción (${localeLabel(trEditing)})` : 'Nueva traducción'}
              </Text>

              {trEditing ? null : (
                <>
                  <Text style={styles.label}>Idioma</Text>
                  <View style={styles.localeRow}>
                    {LOCALES.map((l) => {
                      const taken = translations.some((t) => t.locale === l.code);
                      const on = trLocale === l.code;
                      return (
                        <Pressable
                          key={l.code}
                          style={[styles.localeChip, on && styles.localeChipOn, taken && !on && styles.disabled]}
                          // A locale already written is edited from its row, not re-added here.
                          disabled={taken}
                          onPress={() => setTrLocale(l.code)}
                          accessibilityRole="button"
                        >
                          <Text style={[styles.localeChipText, on && styles.localeChipTextOn]}>{l.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              <Text style={styles.label}>Nombre</Text>
              <TextInput
                style={styles.input}
                value={trName}
                onChangeText={setTrName}
                placeholder="Ej: Presidente beer 650ml"
                placeholderTextColor={t.textFaint}
              />

              <Text style={styles.label}>Descripción (opcional)</Text>
              <TextInput
                style={styles.input}
                value={trDescription}
                onChangeText={setTrDescription}
                placeholder="Ej: Cold bottle, 650 ml"
                placeholderTextColor={t.textFaint}
              />

              {trError ? <Text style={styles.error}>{trError}</Text> : null}

              <Pressable style={[styles.primary, trSaving && styles.disabled]} disabled={trSaving} onPress={saveTranslation}>
                {trSaving
                  ? <ActivityIndicator color={t.onAccent} />
                  : <Text style={styles.primaryText}>Guardar traducción</Text>}
              </Pressable>
              <Pressable onPress={() => setTrOpen(false)} disabled={trSaving}>
                <Text style={styles.cancel}>Cancelar</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  title: { fontSize: 18, fontWeight: '900', color: t.text },
  body: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  photo: { width: 68, height: 68, borderRadius: 12, backgroundColor: t.cardStrong },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.border },
  photoEmoji: { fontSize: 26 },
  photoTitle: { fontSize: 15, fontWeight: '800', color: t.text },
  photoSub: { fontSize: 12, fontWeight: '600', color: t.textMuted, marginTop: 2 },
  label: { fontSize: 13, fontWeight: '700', color: t.textMuted, marginTop: 6 },
  input: { backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: t.text },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: t.accent, borderColor: t.accent },
  checkboxTick: { color: t.onAccent, fontWeight: '900', fontSize: 14 },
  toggleTitle: { fontSize: 15, fontWeight: '800', color: t.text },
  toggleSub: { fontSize: 12, fontWeight: '600', color: t.textMuted, marginTop: 1 },
  error: { color: t.danger, fontSize: 14, marginTop: 8 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: t.text },
  sectionAction: { color: t.accent, fontSize: 14, fontWeight: '800' },
  trEmpty: { color: t.textFaint, fontSize: 13, lineHeight: 18, marginTop: 6 },
  trRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8,
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  trBadge: { backgroundColor: t.cardStrong, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  trBadgeText: { color: t.text, fontSize: 12, fontWeight: '900' },
  trName: { color: t.text, fontSize: 14, fontWeight: '700' },
  trDesc: { color: t.textMuted, fontSize: 12, marginTop: 1 },
  trEdit: { fontSize: 14 },

  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0b2a6b', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderColor: t.border, padding: 18, paddingBottom: 28, gap: 8,
    maxWidth: 520, width: '100%', alignSelf: 'center',
  },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: t.text, marginBottom: 4 },
  localeRow: { flexDirection: 'row', gap: 8 },
  localeChip: {
    flex: 1, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  localeChipOn: { backgroundColor: t.accent, borderColor: t.accent },
  localeChipText: { color: t.text, fontSize: 14, fontWeight: '800' },
  localeChipTextOn: { color: t.onAccent },
  primary: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  primaryText: { color: t.onAccent, fontSize: 16, fontWeight: '800' },
  cancel: { color: t.textMuted, textAlign: 'center', paddingVertical: 12, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
