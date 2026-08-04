import React, { useRef, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  PanResponder,
  Text,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAppTheme } from "../hooks/useAppTheme";
import { useTranslation } from "../hooks/useTranslation";

const PALETTE = ["#1C1C1E", "#FF3B30", "#FF9500", "#34C759", "#007AFF", "#AF52DE", "#FFFFFF"];
const STROKE_WIDTHS = [4, 8, 14];

export const DrawingPad = ({ visible, onClose, onSend }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);

  const [paths, setPaths] = useState([]);
  const [color, setColor] = useState(PALETTE[0]);
  const [strokeWidth, setStrokeWidth] = useState(STROKE_WIDTHS[0]);
  const [sending, setSending] = useState(false);
  const currentPathRef = useRef(null);
  const [, forceRender] = useState(0);
  const canvasRef = useRef(null);
  const colorRef = useRef(color);
  const strokeWidthRef = useRef(strokeWidth);
  colorRef.current = color;
  strokeWidthRef.current = strokeWidth;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        const { locationX, locationY } = event.nativeEvent;
        currentPathRef.current = {
          d: `M${locationX},${locationY}`,
          color: colorRef.current,
          strokeWidth: strokeWidthRef.current,
        };
        forceRender((value) => value + 1);
      },
      onPanResponderMove: (event) => {
        const { locationX, locationY } = event.nativeEvent;
        if (!currentPathRef.current) return;
        currentPathRef.current = {
          ...currentPathRef.current,
          d: `${currentPathRef.current.d} L${locationX},${locationY}`,
        };
        forceRender((value) => value + 1);
      },
      onPanResponderRelease: () => {
        if (currentPathRef.current) {
          setPaths((prev) => [...prev, currentPathRef.current]);
          currentPathRef.current = null;
        }
      },
    })
  ).current;

  const handleUndo = () => setPaths((prev) => prev.slice(0, -1));
  const handleClear = () => setPaths([]);

  const handleClose = () => {
    setPaths([]);
    currentPathRef.current = null;
    onClose();
  };

  const handleSend = async () => {
    if (!paths.length || sending) return;
    setSending(true);
    try {
      const uri = await captureRef(canvasRef, { format: "png", quality: 1 });
      setPaths([]);
      onSend(uri);
    } catch (error) {
      console.error("Error capturing drawing:", error);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
            <Ionicons name="close" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("messages.drawingTitle")}</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={handleUndo}
              style={styles.headerButton}
              disabled={!paths.length}
            >
              <Ionicons
                name="arrow-undo"
                size={22}
                color={paths.length ? colors.text : colors.mutedText}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleClear}
              style={styles.headerButton}
              disabled={!paths.length}
            >
              <Ionicons
                name="trash"
                size={22}
                color={paths.length ? colors.danger : colors.mutedText}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View
          ref={canvasRef}
          style={styles.canvas}
          collapsable={false}
          {...panResponder.panHandlers}
        >
          <Svg style={StyleSheet.absoluteFill}>
            {paths.map((path, index) => (
              <Path
                key={index}
                d={path.d}
                stroke={path.color}
                strokeWidth={path.strokeWidth}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {currentPathRef.current && (
              <Path
                d={currentPathRef.current.d}
                stroke={currentPathRef.current.color}
                strokeWidth={currentPathRef.current.strokeWidth}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </Svg>
        </View>

        <View style={styles.toolbar}>
          <View style={styles.swatchRow}>
            {PALETTE.map((swatch) => (
              <TouchableOpacity
                key={swatch}
                style={[
                  styles.swatch,
                  { backgroundColor: swatch },
                  swatch === color && styles.swatchActive,
                ]}
                onPress={() => setColor(swatch)}
              />
            ))}
          </View>
          <View style={styles.strokeRow}>
            {STROKE_WIDTHS.map((width) => (
              <TouchableOpacity
                key={width}
                style={[styles.strokeOption, width === strokeWidth && styles.strokeOptionActive]}
                onPress={() => setStrokeWidth(width)}
              >
                <View
                  style={{
                    width: width,
                    height: width,
                    borderRadius: width / 2,
                    backgroundColor: colors.text,
                  }}
                />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.sendButton, !paths.length && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!paths.length || sending}
            >
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.sendButtonText}>{t("messages.drawingSend")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingTop: 50,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerButton: {
      padding: 8,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
    },
    headerActions: {
      flexDirection: "row",
    },
    canvas: {
      flex: 1,
      backgroundColor: "#FFFFFF",
    },
    toolbar: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 12,
    },
    swatchRow: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    swatch: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    swatchActive: {
      borderWidth: 3,
      borderColor: colors.primary,
    },
    strokeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    strokeOption: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.input,
    },
    strokeOptionActive: {
      borderWidth: 2,
      borderColor: colors.primary,
    },
    sendButton: {
      marginLeft: "auto",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
    sendButtonText: {
      color: "#fff",
      fontWeight: "600",
      fontSize: 14,
    },
  });
