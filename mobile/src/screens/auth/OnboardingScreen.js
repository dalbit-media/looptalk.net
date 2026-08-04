import React, { useRef, useState } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LanguageFooter } from "../../components/LanguageFooter";
import { useAppTheme } from "../../hooks/useAppTheme";
import { useTranslation } from "../../hooks/useTranslation";
import { BrandMark } from "../../components/BrandMark";

const SLIDES = [
  {
    scene: "invitation",
    title: "onboarding.invitationTitle",
    body: "onboarding.invitationBody",
    eyebrow: "onboarding.invitationEyebrow",
    detail: "onboarding.invitationDetail",
    accent: "#007AFF",
    symbol: "01",
  },
  {
    scene: "circle",
    title: "onboarding.closedTitle",
    body: "onboarding.closedBody",
    eyebrow: "onboarding.closedEyebrow",
    detail: "onboarding.closedDetail",
    accent: "#1F8A70",
    symbol: "02",
  },
  {
    scene: "access",
    title: "onboarding.accessTitle",
    body: "onboarding.accessBody",
    eyebrow: "onboarding.accessEyebrow",
    detail: "onboarding.accessDetail",
    accent: "#D97706",
    symbol: "03",
  },
  {
    scene: "contribution",
    title: "onboarding.contributionTitle",
    body: "onboarding.contributionBody",
    eyebrow: "onboarding.contributionEyebrow",
    detail: "onboarding.contributionDetail",
    accent: "#C2415D",
    symbol: "04",
  },
  {
    scene: "marketplace",
    title: "onboarding.marketplaceTitle",
    body: "onboarding.marketplaceBody",
    eyebrow: "onboarding.marketplaceEyebrow",
    detail: "onboarding.marketplaceDetail",
    accent: "#7A5C00",
    symbol: "05",
  },
];

const SlideIllustration = ({ item, width, colors, styles }) => {
  const sceneWidth = Math.min(width - 56, 520);
  const softAccent = `${item.accent}18`;

  const avatar = (position, icon = "person") => (
    <View
      style={[
        styles.avatar,
        position,
        { backgroundColor: colors.surface, borderColor: item.accent },
      ]}
    >
      <Ionicons name={icon} size={18} color={item.accent} />
    </View>
  );

  return (
    <View
      style={[
        styles.illustration,
        { width: sceneWidth, backgroundColor: softAccent, borderColor: `${item.accent}42` },
      ]}
    >
      <View style={[styles.illustrationOffset, { borderColor: `${item.accent}42` }]} />
      <View style={[styles.sceneNumber, { backgroundColor: item.accent }]}>
        <Text style={styles.sceneNumberText}>{item.symbol}</Text>
      </View>

      {item.scene === "invitation" && (
        <View style={styles.sceneCenter}>
          <View style={[styles.envelope, { backgroundColor: colors.surface }]}> 
            <Ionicons name="mail-unread" size={58} color={item.accent} />
            <View style={[styles.approvalBadge, { backgroundColor: item.accent }]}>
              <Ionicons name="checkmark" size={17} color="#FFFFFF" />
            </View>
          </View>
          {avatar(styles.avatarLeft)}
          {avatar(styles.avatarRight, "person-outline")}
          <View style={[styles.connectionLine, { backgroundColor: item.accent }]} />
        </View>
      )}

      {item.scene === "circle" && (
        <View style={[styles.trustRing, { borderColor: item.accent }]}> 
          <View style={[styles.lockCore, { backgroundColor: item.accent }]}>
            <Ionicons name="lock-closed" size={34} color="#FFFFFF" />
          </View>
          {avatar(styles.avatarTop)}
          {avatar(styles.avatarBottomLeft, "person-outline")}
          {avatar(styles.avatarBottomRight)}
        </View>
      )}

      {item.scene === "access" && (
        <View style={styles.deviceScene}>
          <View style={[styles.device, styles.deviceBack, { borderColor: item.accent, backgroundColor: colors.surface }]}>
            <Ionicons name="chatbubble-ellipses" size={30} color={item.accent} />
          </View>
          <View style={[styles.secureConnector, { backgroundColor: item.accent }]} />
          <View style={[styles.device, styles.deviceFront, { borderColor: item.accent, backgroundColor: colors.surface }]}>
            <Ionicons name="people" size={30} color={item.accent} />
          </View>
          <View style={[styles.shieldBadge, { backgroundColor: item.accent }]}>
            <Ionicons name="shield-checkmark" size={30} color="#FFFFFF" />
          </View>
        </View>
      )}

      {item.scene === "contribution" && (
        <View style={styles.contributionScene}>
          <View style={[styles.creditCore, { backgroundColor: item.accent }]}>
            <Ionicons name="sparkles" size={30} color="#FFFFFF" />
            <Text style={styles.creditCoreText}>C</Text>
          </View>
          {avatar(styles.contributorLeft, "chatbubble-ellipses")}
          {avatar(styles.contributorTop, "people")}
          {avatar(styles.contributorRight, "heart")}
          <View style={[styles.contributionLine, styles.contributionLineLeft, { backgroundColor: item.accent }]} />
          <View style={[styles.contributionLine, styles.contributionLineTop, { backgroundColor: item.accent }]} />
          <View style={[styles.contributionLine, styles.contributionLineRight, { backgroundColor: item.accent }]} />
        </View>
      )}

      {item.scene === "marketplace" && (
        <View style={styles.marketplaceScene}>
          <View style={[styles.marketDevice, { backgroundColor: colors.surface, borderColor: item.accent }]}>
            <View style={[styles.marketHeader, { backgroundColor: item.accent }]}>
              <Ionicons name="storefront" size={24} color="#FFFFFF" />
            </View>
            <View style={styles.marketGrid}>
              <View style={[styles.marketItem, { backgroundColor: `${item.accent}24` }]} />
              <View style={[styles.marketItem, { backgroundColor: `${item.accent}38` }]} />
              <View style={[styles.marketItem, { backgroundColor: `${item.accent}4D` }]} />
              <View style={[styles.marketItem, { backgroundColor: `${item.accent}62` }]} />
            </View>
          </View>
          <View style={[styles.marketCredit, { backgroundColor: item.accent }]}>
            <Text style={styles.marketCreditText}>C</Text>
          </View>
          <View style={[styles.marketBag, { backgroundColor: colors.surface, borderColor: item.accent }]}>
            <Ionicons name="bag-handle" size={25} color={item.accent} />
          </View>
        </View>
      )}
    </View>
  );
};

export const OnboardingScreen = ({ navigation }) => {
  const t = useTranslation();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const listRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const styles = createStyles(colors);
  const isLastSlide = activeIndex === SLIDES.length - 1;

  const continueToLogin = () => navigation.navigate("Login");

  const goToSlide = (index) => {
    setActiveIndex(index);
    listRef.current?.scrollToOffset({ offset: index * width, animated: true });
  };

  const handleNext = () => {
    if (isLastSlide) {
      continueToLogin();
      return;
    }
    const nextIndex = activeIndex + 1;
    goToSlide(nextIndex);
  };

  const renderSlide = ({ item }) => (
    <View style={[styles.slide, { width }]}>
      <SlideIllustration item={item} width={width} colors={colors} styles={styles} />
      <Text style={[styles.eyebrow, { color: item.accent }]}>
        {t(item.eyebrow)}
      </Text>
      <Text style={[styles.title, { color: colors.text }]}>{t(item.title)}</Text>
      <Text style={[styles.body, { color: colors.secondaryText }]}>
        {t(item.body)}
      </Text>
      <View style={[styles.detailRow, { borderColor: colors.border }]}> 
        <Ionicons name="sparkles" size={17} color={item.accent} />
        <Text style={[styles.detail, { color: colors.text }]}>{t(item.detail)}</Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.topBar}>
        <View style={styles.brandLockup}>
          <BrandMark size={32} />
          <Text style={[styles.brand, { color: colors.text }]}>{t("brand.name")}</Text>
        </View>
        <TouchableOpacity onPress={continueToLogin} style={styles.skipButton}>
          <Text style={[styles.skipText, { color: colors.secondaryText }]}>
            {t("onboarding.skip")}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
          ref={listRef}
          data={SLIDES}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.symbol}
          renderItem={renderSlide}
          onMomentumScrollEnd={(event) => {
            setActiveIndex(Math.round(event.nativeEvent.contentOffset.x / width));
          }}
        />

      <View style={styles.controls}>
        <View style={styles.pagination}>
          {SLIDES.map((slide, index) => (
            <TouchableOpacity
              key={slide.symbol}
              accessibilityRole="button"
              accessibilityLabel={`${index + 1} / ${SLIDES.length}`}
              onPress={() => goToSlide(index)}
              hitSlop={8}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    index === activeIndex ? SLIDES[activeIndex].accent : colors.border,
                  width: index === activeIndex ? 28 : 8,
                },
              ]}
            />
          ))}
        </View>
        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: SLIDES[activeIndex].accent }]}
          onPress={handleNext}
        >
          <Text style={styles.nextText}>
            {t(isLastSlide ? "onboarding.start" : "onboarding.next")}
          </Text>
          <Ionicons
            name={isLastSlide ? "checkmark" : "arrow-forward"}
            size={20}
            color="#FFFFFF"
          />
        </TouchableOpacity>
        <LanguageFooter />
      </View>
    </View>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  brandLockup: { flexDirection: "row", alignItems: "center", gap: 8 },
  brand: { fontSize: 22, fontWeight: "800" },
  skipButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  skipText: { fontSize: 14, fontWeight: "600" },
  slide: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingBottom: 8,
  },
  illustration: {
    height: 226,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 22,
  },
  illustrationOffset: {
    position: "absolute",
    top: 8,
    right: -8,
    bottom: -8,
    left: 8,
    borderWidth: 1,
    borderRadius: 8,
  },
  sceneNumber: {
    position: "absolute",
    top: 14,
    left: 14,
    width: 34,
    height: 26,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  sceneNumberText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  sceneCenter: { width: 250, height: 150, alignItems: "center", justifyContent: "center" },
  envelope: {
    zIndex: 2,
    width: 112,
    height: 92,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  approvalBadge: {
    position: "absolute",
    right: -8,
    bottom: -8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  connectionLine: { position: "absolute", width: 184, height: 2, opacity: 0.35 },
  avatar: {
    position: "absolute",
    zIndex: 3,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLeft: { left: 0 },
  avatarRight: { right: 0 },
  avatarTop: { top: -22, left: 55 },
  avatarBottomLeft: { bottom: -14, left: -12 },
  avatarBottomRight: { right: -12, bottom: -14 },
  trustRing: {
    width: 154,
    height: 154,
    borderRadius: 77,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  lockCore: { width: 70, height: 70, borderRadius: 35, alignItems: "center", justifyContent: "center" },
  deviceScene: { width: 250, height: 165, alignItems: "center", justifyContent: "center" },
  device: {
    position: "absolute",
    width: 78,
    height: 128,
    borderWidth: 2,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  deviceBack: { left: 25, transform: [{ rotate: "-7deg" }] },
  deviceFront: { right: 25, transform: [{ rotate: "7deg" }] },
  secureConnector: { width: 72, height: 3, opacity: 0.45 },
  shieldBadge: {
    position: "absolute",
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
  },
  contributionScene: { width: 260, height: 170, alignItems: "center", justifyContent: "center" },
  creditCore: { zIndex: 3, width: 82, height: 82, borderRadius: 41, alignItems: "center", justifyContent: "center" },
  creditCoreText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900", marginTop: -3 },
  contributorLeft: { left: 8, top: 64 },
  contributorTop: { top: 0, left: 108 },
  contributorRight: { right: 8, top: 64 },
  contributionLine: { position: "absolute", width: 80, height: 2, opacity: 0.4 },
  contributionLineLeft: { left: 48, transform: [{ rotate: "-15deg" }] },
  contributionLineTop: { top: 48, transform: [{ rotate: "90deg" }] },
  contributionLineRight: { right: 48, transform: [{ rotate: "15deg" }] },
  marketplaceScene: { width: 270, height: 175, alignItems: "center", justifyContent: "center" },
  marketDevice: { width: 142, height: 154, borderWidth: 2, borderRadius: 12, overflow: "hidden" },
  marketHeader: { height: 48, alignItems: "center", justifyContent: "center" },
  marketGrid: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 12 },
  marketItem: { width: 51, height: 35, borderRadius: 5 },
  marketCredit: { position: "absolute", left: 20, bottom: 13, width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  marketCreditText: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  marketBag: { position: "absolute", right: 18, top: 18, width: 52, height: 52, borderRadius: 8, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: "800", textTransform: "uppercase" },
  title: { marginTop: 7, fontSize: 31, lineHeight: 37, fontWeight: "800" },
  body: { marginTop: 10, maxWidth: 520, fontSize: 16, lineHeight: 24 },
  detailRow: { marginTop: 13, paddingTop: 12, borderTopWidth: 1, flexDirection: "row", alignItems: "center", gap: 9, maxWidth: 520 },
  detail: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  controls: { paddingHorizontal: 24 },
  pagination: {
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  dot: { height: 8, borderRadius: 4 },
  nextButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 8,
  },
  nextText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});