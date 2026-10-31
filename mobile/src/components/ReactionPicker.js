import React from "react";
import { ActivityIndicator, Modal, StyleSheet, TouchableOpacity, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AppText as Text } from "./AppText";

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"];

export const ReactionBar = ({ reactions = [], userId, colors, onSelect, onAdd, disabled = false, addLabel }) => {
  const styles = createStyles(colors);
  const grouped = new Map();
  for (const reaction of reactions) {
    const current = grouped.get(reaction.emoji) || { emoji: reaction.emoji, count: 0, selected: false };
    current.count = reaction.count ?? current.count + 1;
    current.selected ||= Boolean(reaction.reactedByMe || (userId && reaction.userId === userId));
    grouped.set(reaction.emoji, current);
  }

  if (!grouped.size && !onAdd) return null;
  return (
    <View style={styles.reactionBar}>
      {[...grouped.values()].map(({ emoji, count, selected }) => (
        <TouchableOpacity key={emoji} accessibilityRole="button"
          accessibilityLabel={`${emoji}, ${count}`}
          accessibilityState={{ selected, disabled: disabled || !onSelect }}
          disabled={disabled || !onSelect}
          onPress={onSelect ? (event) => { event?.stopPropagation?.(); onSelect(emoji); } : undefined}
          style={[styles.reactionChip, selected && styles.reactionChipSelected, disabled && styles.disabled]}>
          <Text style={styles.reactionEmoji}>{emoji}</Text>
          <Text style={[styles.reactionCount, selected && styles.reactionCountSelected]}>{count}</Text>
        </TouchableOpacity>
      ))}
      {onAdd && <TouchableOpacity accessibilityRole="button" accessibilityLabel={addLabel}
        accessibilityState={{ disabled }} disabled={disabled}
        onPress={(event) => { event?.stopPropagation?.(); onAdd(); }}
        style={[styles.addReaction, disabled && styles.disabled]}>
        <Ionicons name="add" size={17} color={colors.secondaryText} />
        <Ionicons name="happy-outline" size={16} color={colors.secondaryText} />
      </TouchableOpacity>}
    </View>
  );
};

export const ReactionPicker = ({ visible, title, hint, closeLabel, selected = [], colors, onClose, onSelect, disabled = false }) => {
  const styles = createStyles(colors);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal accessibilityRole="dialog">
          <View style={styles.heading}>
            <View style={styles.headingCopy}>
              <Text style={styles.title}>{title}</Text>
              {!!hint && <Text style={styles.hint}>{hint}</Text>}
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={closeLabel}
              onPress={onClose} disabled={disabled} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={colors.secondaryText} />
            </TouchableOpacity>
          </View>
          {disabled && <ActivityIndicator color={colors.navigationAccent} />}
          <View style={styles.emojiGrid}>
            {REACTION_EMOJIS.map((emoji) => {
              const isSelected = selected.includes(emoji);
              return <TouchableOpacity key={emoji} accessibilityRole="button" accessibilityLabel={emoji}
                accessibilityState={{ selected: isSelected, disabled }} disabled={disabled}
                onPress={() => onSelect(emoji)}
                style={[styles.emojiButton, isSelected && styles.emojiButtonSelected]}>
                <Text style={styles.emoji}>{emoji}</Text>
                {isSelected && <Ionicons name="checkmark-circle" size={15} color={colors.navigationAccent} style={styles.checkmark} />}
              </TouchableOpacity>;
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (colors) => StyleSheet.create({
  reactionBar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 6 },
  reactionChip: { minWidth: 48, minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 9, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  reactionChipSelected: { borderColor: colors.navigationAccent, backgroundColor: colors.primarySoft },
  reactionEmoji: { fontSize: 16 },
  reactionCount: { color: colors.secondaryText, fontSize: 12, fontWeight: "700" },
  reactionCountSelected: { color: colors.navigationAccent },
  disabled: { opacity: 0.55 },
  addReaction: { width: 38, height: 34, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 1, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input },
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "rgba(10,14,20,0.55)" },
  sheet: { width: "100%", maxWidth: 420, padding: 20, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 12 },
  heading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 18 },
  headingCopy: { flex: 1, gap: 4 },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  hint: { color: colors.secondaryText, fontSize: 13, lineHeight: 19 },
  closeButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: colors.input },
  emojiGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10 },
  emojiButton: { width: 62, height: 62, alignItems: "center", justifyContent: "center", borderRadius: 19, backgroundColor: colors.input },
  emojiButtonSelected: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.navigationAccent },
  emoji: { fontSize: 29 },
  checkmark: { position: "absolute", right: 3, top: 3 },
});
