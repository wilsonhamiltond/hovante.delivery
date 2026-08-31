import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as api from '../../src/api';
import { setFlash } from '../../src/flash';
import { BackButton, BACK_BUTTON_WIDTH } from '../../src/BackButton';
import { GradientBackground, t } from '../../src/theme';
import { useStrings, type Locale } from '../../src/i18n';

// The locales a translation can be written in. Spanish is the base language -- the product's own
// name and description above -- so it is deliberately not offered (mirrors the ERP's editor).
const LOCALES = [
  { code: 'en' },
  { code: 'fr' },
];

const S: Record<
  Locale,
  {
    localeLabel: (code: string) => string;
    trNameRequired: string;
    cameraPermTitle: string;
    cameraPermBody: string;
    photoPermTitle: string;
    photoPermBody: string;
    photoSourceTitle: string;
    photoSourceBody: string;
    camera: string;
    gallery: string;
    cancel: string;
    nameRequired: string;
    priceInvalid: string;
    savedButImageFailed: (message: string) => string;
    imageUpdated: string;
    saved: string;
    backToProducts: string;
    newProduct: string;
    editProduct: string;
    changePhoto: string;
    addPhoto: string;
    uploadOnSave: string;
    photoHintWeb: string;
    photoHint: string;
    name: string;
    namePlaceholder: string;
    description: string;
    descriptionPlaceholder: string;
    price: string;
    category: string;
    categoryPlaceholder: string;
    categorySearch: string;
    categoryClear: string;
    categoryEmpty: string;
    forSale: string;
    forSaleOn: string;
    forSaleOff: string;
    translations: string;
    addTranslation: string;
    saveFirst: string;
    noTranslations: string;
    editTranslation: (locale: string) => string;
    newTranslation: string;
    language: string;
    trNamePlaceholder: string;
    trDescriptionPlaceholder: string;
    saveTranslation: string;
    createProduct: string;
    saveChanges: string;
  }
> = {
  es: {
    localeLabel: (code) =>
      code === 'en' ? 'Inglés (en)' : code === 'fr' ? 'Francés (fr)' : code,
    trNameRequired: 'El nombre traducido es requerido.',
    cameraPermTitle: 'Permiso de cámara',
    cameraPermBody: 'Activa el permiso de cámara para tomar la foto del producto.',
    photoPermTitle: 'Permiso de fotos',
    photoPermBody: 'Activa el permiso de fotos para agregar una imagen.',
    photoSourceTitle: 'Foto del producto',
    photoSourceBody: '¿De dónde la tomamos?',
    camera: 'Cámara',
    gallery: 'Galería',
    cancel: 'Cancelar',
    nameRequired: 'El nombre es requerido.',
    priceInvalid: 'Escribe un precio válido.',
    savedButImageFailed: (message) => `El producto se guardó, pero la imagen no: ${message}`,
    imageUpdated: ' Imagen actualizada.',
    saved: 'Guardado.',
    backToProducts: 'Productos',
    newProduct: 'Nuevo producto',
    editProduct: 'Editar producto',
    changePhoto: 'Cambiar foto',
    addPhoto: 'Agregar foto',
    uploadOnSave: 'Se subirá al guardar',
    photoHintWeb: 'Cuadrada, es lo que ven los clientes',
    photoHint: 'Cámara o galería · cuadrada, es lo que ven los clientes',
    name: 'Nombre',
    namePlaceholder: 'Ej: Cerveza Presidente 650ml',
    description: 'Descripción (opcional)',
    descriptionPlaceholder: 'Ej: Botella fría, 650 ml',
    price: 'Precio (RD$)',
    category: 'Categoría',
    categoryPlaceholder: 'Seleccionar categoría',
    categorySearch: 'Buscar categoría…',
    categoryClear: 'Quitar categoría (automática)',
    categoryEmpty: 'Ninguna categoría coincide.',
    forSale: 'En venta',
    forSaleOn: 'Los clientes pueden pedirlo',
    forSaleOff: 'No aparece en el mercado',
    translations: 'Traducciones',
    addTranslation: '+ Agregar',
    saveFirst: 'Guarda el producto primero para agregar traducciones.',
    noTranslations: 'Sin traducciones. El nombre y la descripción de arriba son la versión en español; usa “+ Agregar” para inglés o francés.',
    editTranslation: (locale) => `Editar traducción (${locale})`,
    newTranslation: 'Nueva traducción',
    language: 'Idioma',
    trNamePlaceholder: 'Ej: Presidente beer 650ml',
    trDescriptionPlaceholder: 'Ej: Cold bottle, 650 ml',
    saveTranslation: 'Guardar traducción',
    createProduct: 'Crear producto',
    saveChanges: 'Guardar cambios',
  },
  en: {
    localeLabel: (code) =>
      code === 'en' ? 'English (en)' : code === 'fr' ? 'French (fr)' : code,
    trNameRequired: 'The translated name is required.',
    cameraPermTitle: 'Camera permission',
    cameraPermBody: 'Enable the camera permission to take the product photo.',
    photoPermTitle: 'Photo permission',
    photoPermBody: 'Enable the photo permission to add an image.',
    photoSourceTitle: 'Product photo',
    photoSourceBody: 'Where should it come from?',
    camera: 'Camera',
    gallery: 'Gallery',
    cancel: 'Cancel',
    nameRequired: 'The name is required.',
    priceInvalid: 'Enter a valid price.',
    savedButImageFailed: (message) => `The product was saved, but the image was not: ${message}`,
    imageUpdated: ' Image updated.',
    saved: 'Saved.',
    backToProducts: 'Products',
    newProduct: 'New product',
    editProduct: 'Edit product',
    changePhoto: 'Change photo',
    addPhoto: 'Add photo',
    uploadOnSave: 'Will be uploaded on save',
    photoHintWeb: 'Square — it is what customers see',
    photoHint: 'Camera or gallery · square, it is what customers see',
    name: 'Name',
    namePlaceholder: 'E.g. Presidente beer 650ml',
    description: 'Description (optional)',
    descriptionPlaceholder: 'E.g. Cold bottle, 650 ml',
    price: 'Price (RD$)',
    category: 'Category',
    categoryPlaceholder: 'Select category',
    categorySearch: 'Search category…',
    categoryClear: 'Clear category (automatic)',
    categoryEmpty: 'No category matches.',
    forSale: 'For sale',
    forSaleOn: 'Customers can order it',
    forSaleOff: 'Not shown in the marketplace',
    translations: 'Translations',
    addTranslation: '+ Add',
    saveFirst: 'Save the product first to add translations.',
    noTranslations: 'No translations. The name and description above are the Spanish version; use “+ Add” for English or French.',
    editTranslation: (locale) => `Edit translation (${locale})`,
    newTranslation: 'New translation',
    language: 'Language',
    trNamePlaceholder: 'E.g. Presidente beer 650ml',
    trDescriptionPlaceholder: 'E.g. Cold bottle, 650 ml',
    saveTranslation: 'Save translation',
    createProduct: 'Create product',
    saveChanges: 'Save changes',
  },
};

// The merchant's add/edit product form as its own page, reached from the Productos list. `id` is
// "new" when creating; when editing, the product's current fields ride along as route params --
// there is no single-product read for merchants, and the list already holds everything the form
// shows. On web those params live in the URL, so a refresh keeps the form filled.
export default function MerchantProductFormScreen() {
  const router = useRouter();
  const tx = useStrings(S);
  const params = useLocalSearchParams<{
    id: string; name?: string; description?: string; price?: string; active?: string; imageUrl?: string;
    itemTypeId?: string;
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
  // The product's category (item type). Preselected from the row when editing; empty on a new
  // product until one is tapped -- saving without touching it lets the server pick its default.
  const [itemTypeId, setItemTypeId] = useState<string | null>(
    creating || !params.itemTypeId ? null : params.itemTypeId,
  );
  const [categoryOptions, setCategoryOptions] = useState<api.MerchantCategory[]>([]);
  // The category dropdown: its sheet, and the filter typed into it (client-side -- the whole
  // option set is already loaded below).
  const [catOpen, setCatOpen] = useState(false);
  const [catFilter, setCatFilter] = useState('');
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

  // Every category the merchant can pick from -- the paged endpoint drained page by page, since a
  // picker with only its first ten rows would hide the rest. The set is a screenful at most.
  useEffect(() => {
    let alive = true;
    (async () => {
      const all: api.MerchantCategory[] = [];
      for (let pages = 0; pages < 20; pages++) {
        const res = await api.merchantCategories(all.length, api.CATEGORY_PAGE_SIZE);
        if (!alive || !res.success) return;
        const rows = res.data ?? [];
        all.push(...rows.filter((r) => !all.some((c) => c.id === r.id)));
        if (rows.length < api.CATEGORY_PAGE_SIZE) break;
      }
      if (alive) setCategoryOptions(all);
    })();
    return () => { alive = false; };
  }, []);

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
    if (!trName.trim()) { setTrError(tx.trNameRequired); return; }
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

  // Offer both sources. On web there is nothing to choose between: the browser's own file dialog
  // already exposes the camera on a phone, and Alert has no multi-button UI there -- so the choice
  // would swallow the tap instead of presenting itself.
  const pickPhoto = () => {
    if (Platform.OS === 'web') { void pickFromLibrary(); return; }
    Alert.alert(tx.photoSourceTitle, tx.photoSourceBody, [
      { text: tx.camera, onPress: () => { void takePhoto(); } },
      { text: tx.gallery, onPress: () => { void pickFromLibrary(); } },
      { text: tx.cancel, style: 'cancel' },
    ]);
  };

  const save = async () => {
    // Accepts "1.250,50" as well as "1250.50": a price typed on a Dominican phone should not be
    // rejected for its separators.
    const parsed = Number(price.replace(/\./g, '').replace(',', '.'));
    if (!name.trim()) { setFormError(tx.nameRequired); return; }
    if (!Number.isFinite(parsed) || parsed < 0) { setFormError(tx.priceInvalid); return; }

    setSaving(true);
    setFormError(null);
    const input = {
      name: name.trim(),
      description: description.trim() || undefined,
      price: parsed,
      active,
      // Omitted (not null) when untouched: the server then keeps the current category on an
      // edit, or picks its usual default on a create.
      itemTypeId: itemTypeId ?? undefined,
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
        setFormError(tx.savedButImageFailed(up.message));
        return;
      }
      photoNote = tx.imageUpdated;
    }

    setSaving(false);
    // The list refreshes itself on focus; this hands it the confirmation to show above the rows.
    setFlash(`${res.message || tx.saved}${photoNote}`);
    back();
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <BackButton onPress={back} label={tx.backToProducts} />
          <Text style={styles.title}>{creating ? tx.newProduct : tx.editProduct}</Text>
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
                  {pickedPhoto || photoUrl ? tx.changePhoto : tx.addPhoto}
                </Text>
                <Text style={styles.photoSub}>
                  {pickedPhoto
                    ? tx.uploadOnSave
                    // Naming both sources is what makes the camera discoverable: the control looks
                    // the same either way, so nothing else tells them taking one is an option.
                    : Platform.OS === 'web'
                      ? tx.photoHintWeb
                      : tx.photoHint}
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

            <Text style={styles.label}>{tx.description}</Text>
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder={tx.descriptionPlaceholder}
              placeholderTextColor={t.textFaint}
            />

            <Text style={styles.label}>{tx.price}</Text>
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

            {/* The product's category, as a dropdown field. Hidden until the options arrive -- an
                empty field would read as "no categories exist". */}
            {categoryOptions.length > 0 ? (
              <>
                <Text style={styles.label}>{tx.category}</Text>
                <Pressable
                  style={[styles.input, styles.selectField]}
                  onPress={() => { setCatFilter(''); setCatOpen(true); }}
                  accessibilityRole="button"
                >
                  <Text
                    style={itemTypeId ? styles.selectText : styles.selectPlaceholder}
                    numberOfLines={1}
                  >
                    {categoryOptions.find((c) => c.id === itemTypeId)?.name ?? tx.categoryPlaceholder}
                  </Text>
                  <Text style={styles.selectChevron}>▾</Text>
                </Pressable>
              </>
            ) : null}

            <Pressable style={styles.toggleRow} onPress={() => setActive(!active)} accessibilityRole="button">
              <View style={[styles.checkbox, active && styles.checkboxOn]}>
                {active ? <Text style={styles.checkboxTick}>✓</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>{tx.forSale}</Text>
                <Text style={styles.toggleSub}>
                  {active ? tx.forSaleOn : tx.forSaleOff}
                </Text>
              </View>
            </Pressable>

            {/* Traducciones: what the product is called in the app's other languages. The rows are
                the saved set; tapping one reopens it in the popover. */}
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{tx.translations}</Text>
              {productId && !allLocalesUsed ? (
                <Pressable onPress={openTrCreate} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.sectionAction}>{tx.addTranslation}</Text>
                </Pressable>
              ) : null}
            </View>
            {!productId ? (
              <Text style={styles.trEmpty}>{tx.saveFirst}</Text>
            ) : translations.length === 0 ? (
              <Text style={styles.trEmpty}>
                {tx.noTranslations}
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
                : <Text style={styles.primaryText}>{creating && !productId ? tx.createProduct : tx.saveChanges}</Text>}
            </Pressable>
            <Pressable onPress={back} disabled={saving}>
              <Text style={styles.cancel}>{tx.cancel}</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Add / edit translation popover -- the same bottom-sheet shape the list's delete
            confirmation uses. */}
        <Modal visible={trOpen} transparent animationType="slide" onRequestClose={() => setTrOpen(false)}>
          <Pressable style={styles.scrim} onPress={() => setTrOpen(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>
                {trEditing ? tx.editTranslation(tx.localeLabel(trEditing)) : tx.newTranslation}
              </Text>

              {trEditing ? null : (
                <>
                  <Text style={styles.label}>{tx.language}</Text>
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
                          <Text style={[styles.localeChipText, on && styles.localeChipTextOn]}>{tx.localeLabel(l.code)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              <Text style={styles.label}>{tx.name}</Text>
              <TextInput
                style={styles.input}
                value={trName}
                onChangeText={setTrName}
                placeholder={tx.trNamePlaceholder}
                placeholderTextColor={t.textFaint}
              />

              <Text style={styles.label}>{tx.description}</Text>
              <TextInput
                style={styles.input}
                value={trDescription}
                onChangeText={setTrDescription}
                placeholder={tx.trDescriptionPlaceholder}
                placeholderTextColor={t.textFaint}
              />

              {trError ? <Text style={styles.error}>{trError}</Text> : null}

              <Pressable style={[styles.primary, trSaving && styles.disabled]} disabled={trSaving} onPress={saveTranslation}>
                {trSaving
                  ? <ActivityIndicator color={t.onAccent} />
                  : <Text style={styles.primaryText}>{tx.saveTranslation}</Text>}
              </Pressable>
              <Pressable onPress={() => setTrOpen(false)} disabled={trSaving}>
                <Text style={styles.cancel}>{tx.cancel}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Category dropdown -- the same bottom sheet, with a filter box on top. The filter is
            client-side: the whole option set is already in memory. */}
        <Modal visible={catOpen} transparent animationType="slide" onRequestClose={() => setCatOpen(false)}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable style={styles.scrim} onPress={() => setCatOpen(false)}>
              <Pressable style={styles.sheet} onPress={() => {}}>
                <Text style={styles.sheetTitle}>{tx.category}</Text>

                <TextInput
                  style={styles.input}
                  value={catFilter}
                  onChangeText={setCatFilter}
                  placeholder={tx.categorySearch}
                  placeholderTextColor={t.textFaint}
                  autoFocus={Platform.OS === 'web'}
                />

                <ScrollView style={styles.optionsList} keyboardShouldPersistTaps="handled">
                  {/* The way back to "let the server decide", only shown while something is picked. */}
                  {itemTypeId ? (
                    <Pressable
                      style={styles.optionRow}
                      onPress={() => { setItemTypeId(null); setCatOpen(false); }}
                      accessibilityRole="button"
                    >
                      <Text style={styles.optionClear}>{tx.categoryClear}</Text>
                    </Pressable>
                  ) : null}

                  {(() => {
                    const q = catFilter.trim().toLowerCase();
                    const matches = categoryOptions.filter((c) => !q || c.name.toLowerCase().includes(q));
                    if (matches.length === 0) {
                      return <Text style={styles.optionEmpty}>{tx.categoryEmpty}</Text>;
                    }
                    return matches.map((c) => {
                      const on = itemTypeId === c.id;
                      return (
                        <Pressable
                          key={c.id}
                          style={[styles.optionRow, on && styles.optionRowOn]}
                          onPress={() => { setItemTypeId(c.id); setCatOpen(false); }}
                          accessibilityRole="button"
                        >
                          <Text style={[styles.optionText, on && styles.optionTextOn]} numberOfLines={1}>
                            {c.name}
                          </Text>
                          {on ? <Text style={styles.optionCheck}>✓</Text> : null}
                        </Pressable>
                      );
                    });
                  })()}
                </ScrollView>

                <Pressable onPress={() => setCatOpen(false)}>
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
  selectField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  selectText: { flex: 1, color: t.text, fontSize: 15, fontWeight: '700' },
  selectPlaceholder: { flex: 1, color: t.textFaint, fontSize: 15 },
  selectChevron: { color: t.textMuted, fontSize: 14, fontWeight: '800' },
  optionsList: { maxHeight: 320, marginTop: 4 },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderBottomWidth: 1, borderBottomColor: t.border,
    paddingVertical: 12, paddingHorizontal: 4,
  },
  optionRowOn: { backgroundColor: t.card, borderRadius: 10 },
  optionText: { flex: 1, color: t.text, fontSize: 15, fontWeight: '600' },
  optionTextOn: { fontWeight: '800' },
  optionCheck: { color: t.accent, fontSize: 16, fontWeight: '900' },
  optionClear: { flex: 1, color: t.textMuted, fontSize: 14, fontWeight: '700', fontStyle: 'italic' },
  optionEmpty: { color: t.textFaint, fontSize: 13, paddingVertical: 14, textAlign: 'center' },
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
