/*
 * 점자 쓰기 학습기 - STM32 NUCLEO-F767ZI 펌웨어 (사용자 코드 부분)
 *
 * STM32CubeIDE 프로젝트의 main.c 중 직접 작성한 부분만 모은 파일입니다.
 * 나머지(클럭, GPIO, USART3/USART6, TIM2 초기화)는 STM32CubeMX가 생성합니다.
 * 핀 설정은 firmware/README.md 를 참고하세요.
 *
 * [A] USER CODE BEGIN 0 : 출력, 점자 해석표(109개), 칸 확정·지우기·완료 처리
 * [B] USER CODE BEGIN 3 : 1ms 폴링 + 5회 연속 확인 디바운싱, 버튼 처리, PINS 상태 출력
 *
 * 출력 프로토콜 (USART6 115200 8N1 → ESP32 → BLE)
 *   CELL <점>  : 한 칸 확정        DEC/PAIR : 해석 결과
 *   BACK / CLEAR : 지우기           DONE      : 낱말 끝
 *   EMPTY        : 점 없이 다음     PINS xxxxxx : 키 상태(0=누름)
 */

/* ======================== [A] USER CODE BEGIN 0 ======================== */
/* USER CODE BEGIN 0 */
// printf를 USB 시리얼로 보내기
int _write(int file, char *ptr, int len) {
  HAL_UART_Transmit(&huart3, (uint8_t*)ptr, len, HAL_MAX_DELAY);
  HAL_UART_Transmit(&huart6, (uint8_t*)ptr, len, HAL_MAX_DELAY);
  return len;
}

// 버튼 6개 정보
GPIO_TypeDef* key_port[6] = {BTN1_GPIO_Port, BTN2_GPIO_Port, BTN3_GPIO_Port,
                             BTN4_GPIO_Port, BTN5_GPIO_Port, BTN6_GPIO_Port};
uint16_t key_pin[6] = {BTN1_Pin, BTN2_Pin, BTN3_Pin, BTN4_Pin, BTN5_Pin, BTN6_Pin};

// 링 버퍼: 인터럽트에서 넣고, 메인 루프에서 꺼냄
typedef struct { uint8_t key; uint8_t down; uint32_t t; } KeyEvt;
#define QN 64
volatile KeyEvt q[QN];
volatile uint8_t qh = 0, qt = 0;

void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin) {
  uint32_t t = __HAL_TIM_GET_COUNTER(&htim2);
  for (int i = 0; i < 6; i++) {
    if (GPIO_Pin == key_pin[i]) {
      uint8_t next = (qh + 1) % QN;
      if (next != qt) {
        q[qh].key = i;
        q[qh].down = (HAL_GPIO_ReadPin(key_port[i], key_pin[i]) == GPIO_PIN_RESET);
        q[qh].t = t;
        qh = next;
      }
    }
  }
}

/* ================================================================
 * 점자 해석기 (친구 코드 braille_decoder.c 를 STM32용으로 옮김)
 * 점 번호: 1 4 / 2 5 / 3 6,  비트: bit0 = 1번 점 ... bit5 = 6번 점
 * 다음 버튼 = 칸 확정, 지우기 버튼 = 지우기, 완료 버튼 = 낱말 끝
 * ================================================================ */
typedef struct { int mode; const char *letter; const char *pattern; } Entry;
enum { BR_ALL = 0, BR_INITIAL, BR_FINAL, BR_VOWEL, BR_SHORT, BR_PHRASE, BR_ENGLISH };
static const char *mode_names[] = { "전체", "초성", "종성", "모음", "약자", "약어", "영어" };

static const Entry entries[] = {
    {BR_INITIAL,"ㄱ","4"},{BR_INITIAL,"ㄴ","14"},{BR_INITIAL,"ㄷ","24"},{BR_INITIAL,"ㄹ","5"},
    {BR_INITIAL,"ㅁ","15"},{BR_INITIAL,"ㅂ","45"},{BR_INITIAL,"ㅅ","6"},{BR_INITIAL,"ㅈ","46"},
    {BR_INITIAL,"ㅊ","56"},{BR_INITIAL,"ㅋ","124"},{BR_INITIAL,"ㅌ","125"},{BR_INITIAL,"ㅍ","145"},
    {BR_INITIAL,"ㅎ","245"},{BR_INITIAL,"된소리표","6"},

    {BR_FINAL,"ㄱ","1"},{BR_FINAL,"ㄴ","25"},{BR_FINAL,"ㄷ","35"},{BR_FINAL,"ㄹ","2"},
    {BR_FINAL,"ㅁ","26"},{BR_FINAL,"ㅂ","12"},{BR_FINAL,"ㅅ","3"},{BR_FINAL,"ㅇ","2356"},
    {BR_FINAL,"ㅈ","13"},{BR_FINAL,"ㅊ","23"},{BR_FINAL,"ㅋ","235"},{BR_FINAL,"ㅌ","236"},
    {BR_FINAL,"ㅍ","256"},{BR_FINAL,"ㅎ","356"},{BR_FINAL,"ㅆ","34"},

    {BR_VOWEL,"ㅏ","126"},{BR_VOWEL,"ㅑ","345"},{BR_VOWEL,"ㅓ","234"},{BR_VOWEL,"ㅕ","156"},
    {BR_VOWEL,"ㅗ","136"},{BR_VOWEL,"ㅛ","346"},{BR_VOWEL,"ㅜ","134"},{BR_VOWEL,"ㅠ","146"},
    {BR_VOWEL,"ㅡ","246"},{BR_VOWEL,"ㅣ","135"},{BR_VOWEL,"ㅐ","1235"},{BR_VOWEL,"ㅒ","345/1235"},
    {BR_VOWEL,"ㅔ","1345"},{BR_VOWEL,"ㅖ","34"},{BR_VOWEL,"ㅘ","1236"},{BR_VOWEL,"ㅙ","1236/1235"},
    {BR_VOWEL,"ㅚ","13456"},{BR_VOWEL,"ㅝ","1234"},{BR_VOWEL,"ㅞ","1234/1235"},
    {BR_VOWEL,"ㅟ","134/1235"},{BR_VOWEL,"ㅢ","2456"},

    {BR_SHORT,"가","1246"},{BR_SHORT,"나","14"},{BR_SHORT,"다","24"},{BR_SHORT,"마","15"},
    {BR_SHORT,"바","45"},{BR_SHORT,"사","123"},{BR_SHORT,"자","46"},{BR_SHORT,"카","124"},
    {BR_SHORT,"타","125"},{BR_SHORT,"파","145"},{BR_SHORT,"하","245"},{BR_SHORT,"억","1456"},
    {BR_SHORT,"언","23456"},{BR_SHORT,"얼","2345"},{BR_SHORT,"연","16"},{BR_SHORT,"열","1256"},
    {BR_SHORT,"영","12456"},{BR_SHORT,"옥","1346"},{BR_SHORT,"온","12356"},{BR_SHORT,"옹","123456"},
    {BR_SHORT,"운","1245"},{BR_SHORT,"울","12346"},{BR_SHORT,"은","1356"},{BR_SHORT,"을","2346"},
    {BR_SHORT,"인","12345"},{BR_SHORT,"것","456/234"},

    {BR_PHRASE,"그래서","1/234"},{BR_PHRASE,"그러나","1/14"},{BR_PHRASE,"그러면","1/25"},
    {BR_PHRASE,"그러므로","1/26"},{BR_PHRASE,"그런데","1/1345"},
    {BR_PHRASE,"그리고","1/136"},{BR_PHRASE,"그리하여","1/156"},

    {BR_ENGLISH,"a","1"},{BR_ENGLISH,"b","12"},{BR_ENGLISH,"c","14"},{BR_ENGLISH,"d","145"},
    {BR_ENGLISH,"e","15"},{BR_ENGLISH,"f","124"},{BR_ENGLISH,"g","1245"},{BR_ENGLISH,"h","125"},
    {BR_ENGLISH,"i","24"},{BR_ENGLISH,"j","245"},{BR_ENGLISH,"k","13"},{BR_ENGLISH,"l","123"},
    {BR_ENGLISH,"m","134"},{BR_ENGLISH,"n","1345"},{BR_ENGLISH,"o","135"},{BR_ENGLISH,"p","1234"},
    {BR_ENGLISH,"q","12345"},{BR_ENGLISH,"r","1235"},{BR_ENGLISH,"s","234"},{BR_ENGLISH,"t","2345"},
    {BR_ENGLISH,"u","136"},{BR_ENGLISH,"v","1236"},{BR_ENGLISH,"w","2456"},{BR_ENGLISH,"x","1346"},
    {BR_ENGLISH,"y","13456"},{BR_ENGLISH,"z","1356"}
};
#define N_ENTRIES (sizeof(entries) / sizeof(entries[0]))

static unsigned dot_buffer = 0;        // 완료 전까지 누른 점을 모아 두는 곳 (OR)
static char previous_cell[8] = "";     // 바로 앞 칸 (두 칸짜리 글자 확인용)
static int active_mode = BR_ALL;

static void pattern_from_mask(unsigned mask, char out[8]) {
  int n = 0;
  for (int dot = 1; dot <= 6; ++dot)
    if (mask & (1u << (dot - 1))) out[n++] = (char)('0' + dot);
  out[n] = '\0';
}

/* 다음 버튼을 누르면 호출: 모은 점을 한 칸으로 확정하고 해석 */
static void confirm_dots(void) {
  char cur[8], pair[17], line[128];
  if (!dot_buffer) { printf("EMPTY\r\n"); previous_cell[0] = '\0'; return; }

  pattern_from_mask(dot_buffer, cur);
  printf("CELL %s\r\n", cur);                       // 예: CELL 14

  int n = 0, len = snprintf(line, sizeof line, "DEC");
  for (size_t i = 0; i < N_ENTRIES; ++i) {
    if ((active_mode == BR_ALL || entries[i].mode == active_mode)
        && strcmp(cur, entries[i].pattern) == 0 && len < (int)sizeof line) {
      len += snprintf(line + len, sizeof line - len, " %s:%s",
                      mode_names[entries[i].mode], entries[i].letter);
      ++n;
    }
  }
  printf(n ? "%s\r\n" : "DEC NONE\r\n", line);      // 예: DEC 초성:ㄴ 약자:나 영어:c

  if (previous_cell[0]) {                           // 두 칸짜리 (예: 1/14 = 그러나)
    snprintf(pair, sizeof pair, "%s/%s", previous_cell, cur);
    for (size_t i = 0; i < N_ENTRIES; ++i)
      if ((active_mode == BR_ALL || entries[i].mode == active_mode)
          && strcmp(pair, entries[i].pattern) == 0)
        printf("PAIR %s %s:%s\r\n", pair, mode_names[entries[i].mode], entries[i].letter);
  }
  strcpy(previous_cell, cur);
  dot_buffer = 0;                                   // 다음 칸 준비
}

/* 지우기 버튼을 누르면 호출
 * - 완료 전(모은 점이 있을 때): 지금 모은 점을 전부 지움  → CLEAR
 * - 완료 후(모은 점이 없을 때): 바로 앞 칸을 지움(백스페이스) → BACK */
static void delete_pressed(void) {
  if (dot_buffer) {
    char cur[8];
    pattern_from_mask(dot_buffer, cur);
    printf("CLEAR %s\r\n", cur);                 // 예: CLEAR 14 (지운 점도 기록)
    dot_buffer = 0;
  } else {
    printf("BACK\r\n");
    previous_cell[0] = '\0';
  }
}

/* 완료 버튼을 누르면 호출: 지금까지 쓴 칸들을 한 낱말로 끝냄 → DONE
 * (칸들을 '사과' 같은 낱말로 조합하는 일은 폰 웹페이지가 함) */
static void done_pressed(void) {
  if (dot_buffer) confirm_dots();                   // 다음을 안 누른 점이 있으면 먼저 칸 확정
  printf("DONE\r\n");
  previous_cell[0] = '\0';                          // 두 칸 약어가 낱말을 넘어가지 않게
}

/* USER CODE END 0 */


/* ======================== [B] USER CODE BEGIN 3 (while 루프 안) ======================== */
  /* USER CODE BEGIN WHILE */
  while (1)
  {
    /* USER CODE END WHILE */

    /* USER CODE BEGIN 3 */
    /* 1ms마다 키를 읽고, 5ms 동안 같은 값이 유지돼야 진짜 변화로 인정 */
    static uint8_t  st[6]  = {0};   // 인정된 상태: 1 = 누름
    static uint8_t  cnt[6] = {0};   // 바뀐 값이 연속으로 나온 횟수
    static uint32_t t0[6]  = {0};   // 바뀌기 시작한 시각(µs)
    static uint8_t  okSt = 0, okCnt = 0;   // 다음 버튼 상태 (칸 확정)
    static uint8_t  delSt = 0, delCnt = 0; // 지우기 버튼 상태
    static uint8_t  nxSt = 0, nxCnt = 0;   // 완료 버튼 상태 (낱말 끝)
    static uint32_t lastScan = 0, lastPins = 0;

    if (HAL_GetTick() != lastScan) {            // 1ms마다 한 번
      lastScan = HAL_GetTick();
      uint32_t now = __HAL_TIM_GET_COUNTER(&htim2);
      int any = 0;
      for (int i = 0; i < 6; i++) {
        uint8_t raw = (HAL_GPIO_ReadPin(key_port[i], key_pin[i]) == GPIO_PIN_RESET);
        if (raw != st[i]) {
          if (cnt[i] == 0) t0[i] = now;         // 바뀌기 시작한 순간 기록
          if (++cnt[i] >= 5) {                  // 5ms 동안 유지 → 인정
            st[i] = raw; cnt[i] = 0;
            printf("K%d %s %lu\r\n", i + 1, raw ? "DOWN" : "UP", t0[i]);
            if (raw) dot_buffer |= 1u << i;     // 누른 점 모으기
          }
        } else {
          cnt[i] = 0;                           // 튄 거였음 → 취소
        }
        if (st[i]) any = 1;
      }

      /* 다음 버튼 (D7): 칸 확정 */
      uint8_t okRaw = (HAL_GPIO_ReadPin(BTN_NEXT_GPIO_Port, BTN_NEXT_Pin) == GPIO_PIN_RESET);
      if (okRaw != okSt) {
        if (++okCnt >= 5) {
          okSt = okRaw; okCnt = 0;
          if (okSt) confirm_dots();             // 누르는 순간 한 칸 확정
        }
      } else {
        okCnt = 0;
      }

      /* 지우기 버튼 (D9) */
      uint8_t delRaw = (HAL_GPIO_ReadPin(BTN_DEL_GPIO_Port, BTN_DEL_Pin) == GPIO_PIN_RESET);
      if (delRaw != delSt) {
        if (++delCnt >= 5) {
          delSt = delRaw; delCnt = 0;
          if (delSt) delete_pressed();          // 누르는 순간 한 번
        }
      } else {
        delCnt = 0;
      }

      /* 완료 버튼 (D10): 낱말 끝 */
      uint8_t nxRaw = (HAL_GPIO_ReadPin(BTN_DONE_GPIO_Port, BTN_DONE_Pin) == GPIO_PIN_RESET);
      if (nxRaw != nxSt) {
        if (++nxCnt >= 5) {
          nxSt = nxRaw; nxCnt = 0;
          if (nxSt) done_pressed();             // 누르는 순간 낱말 끝
        }
      } else {
        nxCnt = 0;
      }

      HAL_GPIO_WritePin(VIB_GPIO_Port, VIB_Pin, any ? GPIO_PIN_SET : GPIO_PIN_RESET);
    }

    if (HAL_GetTick() - lastPins > 500) {       // 0.5초마다 상태 보내기
      lastPins = HAL_GetTick();
      printf("PINS ");
      for (int i = 0; i < 6; i++) printf("%d", st[i] ? 0 : 1);
      printf("\r\n");
    }
  }
  /* USER CODE END 3 */
