// ESP32: STM32에서 받은 한 줄을 블루투스(BLE)로 폰에 전달
// 한글이 들어간 긴 줄도 잘리지 않게 20바이트씩 나눠 보내고, 끝에 줄바꿈을 붙임
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLE2902.h>

#define SVC_UUID "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define RX_UUID  "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define TX_UUID  "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

BLECharacteristic *txChar;
bool connected = false;

class ServerCB : public BLEServerCallbacks {
  void onConnect(BLEServer *s) { connected = true; }
  void onDisconnect(BLEServer *s) { connected = false; s->getAdvertising()->start(); }
};

void sendBLE(const String &msg) {
  if (!connected) return;
  String s = msg + "\n";
  for (unsigned i = 0; i < s.length(); i += 20) {          // 20바이트씩 나눠 보내기
    String part = s.substring(i, i + 20);
    txChar->setValue((uint8_t*)part.c_str(), part.length());
    txChar->notify();
    delay(4);
  }
}

void setup() {
  Serial.begin(115200);
  Serial2.begin(115200, SERIAL_8N1, 16, 17);  // STM32에서 받는 선: 16번

  BLEDevice::init("BrailleTrainer");
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCB());
  BLEService *svc = server->createService(SVC_UUID);
  txChar = svc->createCharacteristic(TX_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  txChar->addDescriptor(new BLE2902());
  svc->createCharacteristic(RX_UUID, BLECharacteristic::PROPERTY_WRITE);
  svc->start();
  server->getAdvertising()->addServiceUUID(SVC_UUID);
  server->getAdvertising()->start();
  Serial.println("BLE ready");
}

String line;
void loop() {
  while (Serial2.available()) {
    char c = Serial2.read();
    if (c == '\n') { Serial.println(line); sendBLE(line); line = ""; }
    else if (c != '\r') line += c;
  }
  static uint32_t t = 0;                      // 연결 확인용 ping (5초마다)
  if (millis() - t > 5000) { t = millis(); sendBLE("ping"); }
}
