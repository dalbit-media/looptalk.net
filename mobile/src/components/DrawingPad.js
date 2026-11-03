import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, TouchableOpacity, TextInput, Modal, PanResponder, Platform } from "react-native";
import { AppText as Text } from "./AppText";
import Svg, { Path } from "react-native-svg";
import { captureDrawing, releaseDrawing } from "../utils/captureDrawing";
import { addPaintingPoint, paintingPath, paintHistory } from "../utils/painting";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAppTheme } from "../hooks/useAppTheme";
import { useTranslation } from "../hooks/useTranslation";
import { showAlert } from "../utils/showAlert";

const PALETTE = ["#1C1C1E", "#FF3B30", "#FF9500", "#FFD60A", "#34C759", "#007AFF", "#AF52DE", "#FFFFFF"];
const TOOLS = [["brush", "brush-outline"], ["pen", "pencil-outline"], ["marker", "pencil"], ["eraser", "bandage-outline"]];
const emptyHistory = () => ({ past: [], present: [], future: [] });
const Stroke = memo(({ stroke }) => (
  <Path d={stroke.d} fill={stroke.color} fillOpacity={stroke.opacity} stroke="none" />
));

export const DrawingPad = ({ visible, onClose, onSend }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const [history, setHistory] = useState(emptyHistory);
  const paths = history.present;
  const [color, setColor] = useState(PALETTE[0]);
  const [customColor, setCustomColor] = useState(PALETTE[0]);
  const [tool, setTool] = useState("brush");
  const [size, setSize] = useState(8);
  const [opacity, setOpacity] = useState(1);
  const [sending, setSending] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [preview, setPreview] = useState(null);
  const currentPathRef = useRef(null);
  const canvasRef = useRef(null);
  const [canvas, setCanvas] = useState(null);
  const sendingRef = useRef(false);
  const pointerRef = useRef(null);
  const frameRef = useRef(null);
  const settingsRef = useRef(null);
  settingsRef.current = { color, tool, size, opacity };
  const bindCanvas = useCallback((node) => {
    canvasRef.current = node;
    setCanvas(node);
  }, []);

  const cancelPreview = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  };
  const updatePreview = () => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const stroke = currentPathRef.current;
      if (stroke) setPreview({ ...stroke, d: paintingPath(stroke) });
    });
  };
  const beginStroke = (x, y, pressure) => {
    if (sendingRef.current) return;
    const settings = settingsRef.current;
    currentPathRef.current = {
      ...settings, color: settings.tool === "eraser" ? "#FFFFFF" : settings.color,
      opacity: settings.tool === "eraser" ? 1 : settings.opacity * (settings.tool === "marker" ? 0.35 : 1),
      points: [{ x, y, pressure }],
    };
    setDrawing(true);
    updatePreview();
  };
  const moveStroke = (x, y, pressure) => {
    if (sendingRef.current || !currentPathRef.current) return;
    addPaintingPoint(currentPathRef.current.points, { x, y, pressure });
    updatePreview();
  };
  const finishStroke = (cancelled = false) => {
    cancelPreview();
    const stroke = currentPathRef.current;
    currentPathRef.current = null;
    if (stroke && !cancelled) {
      setHistory((previous) => paintHistory(previous, {
        type: "stroke", stroke: { d: paintingPath(stroke), color: stroke.color, opacity: stroke.opacity },
      }));
    }
    setPreview(null);
    setDrawing(false);
  };
  const handlersRef = useRef(null);
  handlersRef.current = { beginStroke, moveStroke, finishStroke };

  useEffect(() => {
    if (!visible) handlersRef.current.finishStroke(true);
    return cancelPreview;
  }, [visible]);

  useEffect(() => {
    if (Platform.OS !== "web" || !visible || !canvas) return undefined;
    const point = (event, bounds) => {
      return [event.clientX - bounds.left, event.clientY - bounds.top,
        event.pointerType === "pen"
          ? (event.pressure > 0 ? event.pressure : currentPathRef.current?.points.at(-1)?.pressure ?? 0.5)
          : 0.5];
    };
    const down = (event) => {
      if (sendingRef.current || pointerRef.current !== null || event.button !== 0) return;
      event.preventDefault();
      canvas.setPointerCapture?.(event.pointerId);
      pointerRef.current = event.pointerId;
      handlersRef.current.beginStroke(...point(event, canvas.getBoundingClientRect()));
    };
    const move = (event) => {
      if (event.pointerId !== pointerRef.current) return;
      event.preventDefault();
      const samples = event.getCoalescedEvents?.();
      const bounds = canvas.getBoundingClientRect();
      for (const sample of samples?.length ? samples : [event]) handlersRef.current.moveStroke(...point(sample, bounds));
    };
    const finish = (event) => {
      if (event.pointerId !== pointerRef.current) return;
      pointerRef.current = null;
      if (event.type === "pointerup") {
        handlersRef.current.moveStroke(...point(event, canvas.getBoundingClientRect()));
      }
      handlersRef.current.finishStroke(event.type === "pointercancel");
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", finish);
    canvas.addEventListener("lostpointercapture", finish);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", finish);
      canvas.removeEventListener("pointercancel", finish);
      canvas.removeEventListener("lostpointercapture", finish);
      pointerRef.current = null;
      currentPathRef.current = null;
      cancelPreview();
      setPreview(null);
      setDrawing(false);
    };
  }, [visible, canvas]);

  const panResponderRef = useRef(null);
  if (!panResponderRef.current) {
    panResponderRef.current = PanResponder.create({
      onStartShouldSetPanResponder: () => !sendingRef.current,
      onMoveShouldSetPanResponder: () => !sendingRef.current,
      onPanResponderGrant: ({ nativeEvent: e }) => handlersRef.current.beginStroke(e.locationX, e.locationY, e.force > 0 ? e.force : 0.5),
      onPanResponderMove: ({ nativeEvent: e }) => handlersRef.current.moveStroke(e.locationX, e.locationY, e.force > 0 ? e.force : 0.5),
      onPanResponderRelease: () => handlersRef.current.finishStroke(),
      onPanResponderTerminate: () => handlersRef.current.finishStroke(true),
    });
  }

  const editHistory = (type) => {
    if (!sendingRef.current && !currentPathRef.current) setHistory((previous) => paintHistory(previous, { type }));
  };
  const handleClose = () => {
    if (sendingRef.current) return;
    finishStroke(true);
    setHistory(emptyHistory());
    onClose();
  };
  const handleSend = async () => {
    if (!paths.length || currentPathRef.current || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    let uri;
    try {
      uri = await captureDrawing(canvasRef, paths);
      await onSend(uri);
      setHistory(emptyHistory());
    } catch (error) {
      console.error("Error sending drawing:", error);
      showAlert(t("common.error"), t("messages.mediaUploadFailed"));
    } finally {
      if (uri) releaseDrawing(uri);
      sendingRef.current = false;
      setSending(false);
    }
  };
  const locked = sending || drawing;
  const chooseColor = (value) => { setColor(value); setCustomColor(value); };
  const iconButton = (name, label, onPress, disabled, active = false) => (
    <TouchableOpacity key={label} onPress={onPress} disabled={disabled}
      style={[styles.iconButton, active && styles.active]} accessibilityRole="button"
      accessibilityLabel={t(`messages.${label}`)} accessibilityState={{ selected: active, disabled }}>
      <Ionicons name={name} size={21} color={disabled ? colors.mutedText : active ? colors.primary : colors.text} />
    </TouchableOpacity>
  );
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} disabled={sending} style={styles.iconButton}
            accessibilityRole="button" accessibilityLabel={t("common.close")}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>{t("messages.drawingTitle")}</Text>
          <View style={styles.row}>
            {iconButton("arrow-undo", "drawingUndo", () => editHistory("undo"), !history.past.length || locked)}
            {iconButton("arrow-redo", "drawingRedo", () => editHistory("redo"), !history.future.length || locked)}
            {iconButton("trash-outline", "drawingClear", () => editHistory("clear"), !paths.length || locked)}
          </View>
        </View>
        <View ref={bindCanvas} style={styles.canvas} collapsable={false}
          {...(Platform.OS === "web" ? {} : panResponderRef.current.panHandlers)}>
          <Svg width="100%" height="100%" pointerEvents="none" style={[StyleSheet.absoluteFill, styles.drawingPreview]}>
            {paths.map((stroke, index) => <Stroke key={index} stroke={stroke} />)}
            {preview && <Stroke stroke={preview} />}
          </Svg>
        </View>
        <View style={styles.toolbar}>
          <View style={styles.controls}>
            <View style={styles.row}>
              {TOOLS.map(([value, icon]) => iconButton(icon, `drawing${value[0].toUpperCase()}${value.slice(1)}`,
                () => setTool(value), locked, value === tool))}
            </View>
            <TouchableOpacity style={[styles.sendButton, (!paths.length || locked) && styles.disabled]} onPress={handleSend} disabled={!paths.length || locked}
              accessibilityRole="button" accessibilityLabel={t("messages.drawingSend")}>
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.sendText}>{t(sending ? "common.loading" : "messages.drawingSend")}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.controls}>
            <View style={styles.row}>
              <Text style={styles.label}>{t("messages.drawingSize")}</Text>
              {iconButton("remove", "drawingSmaller", () => setSize((value) => Math.max(1, value - (value > 16 ? 4 : 1))), locked || size === 1)}
              <Text style={styles.value}>{size}</Text>
              {iconButton("add", "drawingLarger", () => setSize((value) => Math.min(64, value + (value >= 16 ? 4 : 1))), locked || size === 64)}
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>{t("messages.drawingOpacity")}</Text>
              {iconButton("remove", "drawingLighter", () => setOpacity((value) => Math.max(0.1, Math.round((value - 0.1) * 10) / 10)), locked || opacity === 0.1 || tool === "eraser")}
              <Text style={styles.value}>{Math.round(opacity * 100)}%</Text>
              {iconButton("add", "drawingDarker", () => setOpacity((value) => Math.min(1, Math.round((value + 0.1) * 10) / 10)), locked || opacity === 1 || tool === "eraser")}
            </View>
          </View>
          <View style={styles.palette}>
            {PALETTE.map((swatch) => (
              <TouchableOpacity key={swatch} onPress={() => chooseColor(swatch)} disabled={locked}
                accessibilityRole="button" accessibilityLabel={`${t("messages.drawingColor")} ${swatch}`}
                accessibilityState={{ selected: swatch === color }}
                style={[styles.swatch, { backgroundColor: swatch }, swatch === color && styles.swatchActive]} />
            ))}
            <TextInput value={customColor} editable={!locked} maxLength={7} autoCapitalize="characters" autoCorrect={false}
              accessibilityLabel={t("messages.drawingCustomColor")}
              style={[styles.colorInput, { borderColor: /^#[0-9a-f]{6}$/i.test(customColor) ? color : colors.danger }]}
              onChangeText={(value) => {
                setCustomColor(value);
                if (/^#[0-9a-f]{6}$/i.test(value)) setColor(value.toUpperCase());
              }}
              onBlur={() => setCustomColor(color)} />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 8, paddingTop: Platform.OS === "web" ? 8 : 50, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: 16, fontWeight: "600", color: colors.text, flex: 1 },
  row: { flexDirection: "row", alignItems: "center" },
  iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  active: { backgroundColor: colors.input },
  canvas: {
    flex: 1, backgroundColor: "#FFFFFF", overflow: "hidden",
    ...(Platform.OS === "web" ? { touchAction: "none", cursor: "crosshair" } : {}),
  },
  drawingPreview: { width: "100%", height: "100%" },
  toolbar: {
    paddingHorizontal: 10, paddingTop: 6, paddingBottom: Platform.OS === "ios" ? 28 : 10,
    borderTopWidth: 1, borderTopColor: colors.border, gap: 6,
  },
  controls: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 4 },
  label: { fontSize: 11, color: colors.mutedText },
  value: { minWidth: 32, textAlign: "center", fontSize: 12, color: colors.text },
  palette: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  swatchActive: { borderWidth: 3, borderColor: colors.primary },
  colorInput: { height: 36, width: 88, borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, color: colors.text, fontSize: 12 },
  sendButton: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  sendText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  disabled: { opacity: 0.5 },
});
