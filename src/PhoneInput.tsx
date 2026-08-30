import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { CountryCode } from 'libphonenumber-js';
import { COUNTRIES, countryByIso, searchCountries, type Country } from './countries';
import { maskPhone, parsePhone } from './profileForm';
import { t } from './theme';
import { useStrings, type Locale } from './i18n';

const S: Record<
  Locale,
  {
    countryA11y: (name: string, dial: string) => string;
    phonePlaceholder: string;
    countryTitle: string;
    searchPlaceholder: string;
    noResults: string;
  }
> = {
  es: {
    countryA11y: (name, dial) => `País: ${name}, +${dial}`,
    phonePlaceholder: 'Número de teléfono',
    countryTitle: 'País',
    searchPlaceholder: 'Buscar país o código',
    noResults: 'Sin resultados',
  },
  en: {
    countryA11y: (name, dial) => `Country: ${name}, +${dial}`,
    phonePlaceholder: 'Phone number',
    countryTitle: 'Country',
    searchPlaceholder: 'Search country or code',
    noResults: 'No results',
  },
};

interface Props {
  country: CountryCode;
  /** The national part, already formatted for the country -- what the person sees and types. */
  national: string;
  onChange: (next: { country: CountryCode; national: string }) => void;
  placeholder?: string;
}

// A country picker and a number field, side by side. The country decides how the number is grouped
// as it is typed and what counts as complete, so the two belong in one control rather than as two
// fields a caller has to keep in step.
export function PhoneInput({ country, national, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = countryByIso(country);
  const tx = useStrings(S);

  const results = useMemo(() => searchCountries(query), [query]);

  const choose = (c: Country) => {
    setOpen(false);
    setQuery('');
    // Re-group the digits already typed for the new country: the same digits are spaced very
    // differently in, say, Spain and the Dominican Republic.
    onChange({ country: c.iso, national: maskPhone(national, c.iso) });
  };

  return (
    <>
      <View style={styles.row}>
        <Pressable
          style={styles.country}
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={tx.countryA11y(selected.name, selected.dial)}
        >
          <Text style={styles.flag}>{selected.flag}</Text>
          <Text style={styles.dial}>+{selected.dial}</Text>
          <Text style={styles.caret}>▾</Text>
        </Pressable>

        <TextInput
          style={styles.input}
          value={national}
          onChangeText={(v) => {
            // Pasting a full international number ("+34 612 34 56 78") should move the flag with
            // it, rather than mangling the country code into the national part.
            if (v.trim().startsWith('+')) {
              const parsed = parsePhone(v);
              onChange(parsed);
              return;
            }
            onChange({ country, national: maskPhone(v, country) });
          }}
          placeholder={placeholder ?? tx.phonePlaceholder}
          placeholderTextColor={t.textFaint}
          keyboardType="phone-pad"
          // The country is chosen beside it, so a leading + typed here would be a second one.
          autoComplete="tel-national"
        />
      </View>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.title}>{tx.countryTitle}</Text>
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder={tx.searchPlaceholder}
              placeholderTextColor={t.textFaint}
              autoCapitalize="none"
              autoFocus
            />
            <FlatList
              data={results}
              keyExtractor={(c) => c.iso}
              keyboardShouldPersistTaps="handled"
              // 245 rows: virtualised, and a fixed row height lets it skip measuring every one.
              getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
              initialNumToRender={14}
              ListEmptyComponent={<Text style={styles.empty}>{tx.noResults}</Text>}
              renderItem={({ item }) => {
                const active = item.iso === country;
                return (
                  <Pressable
                    style={[styles.item, active && styles.itemActive]}
                    onPress={() => choose(item)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={styles.flag}>{item.flag}</Text>
                    <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.itemDial}>+{item.dial}</Text>
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const ROW_HEIGHT = 52;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  country: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 12,
  },
  flag: { fontSize: 18 },
  dial: { color: t.text, fontSize: 15, fontWeight: '800' },
  caret: { color: t.textMuted, fontSize: 11 },
  input: {
    flex: 1, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, color: t.text, fontSize: 15,
  },

  backdrop: { flex: 1, backgroundColor: 'rgba(3,12,34,0.62)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0b2a6b', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24, maxHeight: '80%',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '900', color: t.text, marginBottom: 10 },
  search: {
    backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, color: t.text, fontSize: 15, marginBottom: 10,
  },
  item: { height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  itemActive: { backgroundColor: t.cardStrong, borderRadius: 10 },
  itemName: { flex: 1, color: t.text, fontSize: 15, fontWeight: '600' },
  itemDial: { color: t.textMuted, fontSize: 14, fontWeight: '700' },
  empty: { color: t.textMuted, textAlign: 'center', paddingVertical: 24 },
});
