# 📱 Flutter Socket.IO & Real-Time Chat Integration Guide

This guide provides everything a Flutter developer needs to connect to the backend **Socket.IO Real-Time Chat System** and handle real-time messaging, typing indicators, presence/online status, media attachments, edits, and deletions.

---

## 1. 📦 Dependencies (pubspec.yaml)

Add the following packages to your Flutter `pubspec.yaml`:

```yaml
dependencies:
  flutter:
    sdk: flutter
  socket_io_client: ^3.0.2  # Official Socket.IO client for Flutter/Dart
  dio: ^5.7.0               # HTTP client for REST endpoints & file uploads
  provider: ^6.1.2          # (Optional) For state management
```

---

## 2. 🔌 Socket Connection & JWT Authentication

### Connection Configuration
The Socket.IO gateway requires JWT authentication during the handshake.

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

IO.Socket? socket;

void initializeSocket({
  required String serverUrl, // e.g. "http://10.0.2.2:3000" (Android Emulator) or "http://localhost:3000" (iOS)
  required String accessToken, // JWT Access Token from Login/Signup
}) {
  socket = IO.io(
    serverUrl,
    IO.OptionBuilder()
        .setTransports(['websocket']) // Use pure WebSocket transport
        .disableAutoConnect()
        .setAuth({'token': accessToken}) // Handshake auth
        .setExtraHeaders({'Authorization': 'Bearer $accessToken'})
        .enableReconnection()
        .setReconnectionDelay(1000)
        .setReconnectionAttempts(10)
        .build(),
  );

  socket!.connect();

  socket!.onConnect((_) {
    print('🟢 Socket Connected: ${socket!.id}');
  });

  socket!.onDisconnect((_) {
    print('🔴 Socket Disconnected');
  });

  socket!.onConnectError((err) {
    print('⚠️ Socket Connection Error: $err');
  });
}
```

> [!NOTE]
> **Host URLs:**
> - Android Emulator: `http://10.0.2.2:3000`
> - iOS Simulator: `http://localhost:3000`
> - Physical Device: `http://<YOUR_COMPUTER_LOCAL_IP>:3000` (e.g. `http://192.168.1.100:3000`)
> - Production: `https://your-domain.com`

---

## 3. 📡 Socket Event Reference

### Summary Table

| Action / Event | Direction | Socket Event Name | Payload / Data |
|---|---|---|---|
| **Join Conversation Room** | Client ➔ Server | `join_conversation` | `{"conversationId": "CONV_ID"}` |
| **Leave Conversation Room** | Client ➔ Server | `leave_conversation` | `{"conversationId": "CONV_ID"}` |
| **Send Message** | Client ➔ Server | `send_message` | `{"conversationId": "...", "content": "...", "type": "TEXT"}` |
| **Receive New Message** | Server ➔ Client | `new_message` | `MessageObject` (JSON) |
| **Typing Indicator (Send)** | Client ➔ Server | `typing` | `{"conversationId": "...", "isTyping": true}` |
| **Typing Indicator (Receive)**| Server ➔ Client | `user_typing` | `{"conversationId": "...", "userId": "...", "userName": "...", "isTyping": true}` |
| **Edit Message (Send)** | Client ➔ Server | `edit_message` | `{"messageId": "...", "content": "..."}` |
| **Edit Message (Receive)** | Server ➔ Client | `message_edited` | `UpdatedMessageObject` (JSON) |
| **Delete Message (Send)** | Client ➔ Server | `delete_message` | `{"messageId": "...", "type": "ME" / "EVERYONE"}` |
| **Delete Message (Receive)** | Server ➔ Client | `message_deleted`| `{"messageId": "...", "conversationId": "...", "type": "..."}` |
| **Online Presence (Receive)**| Server ➔ Client | `presence_update`| `{"userId": "...", "isOnline": true/false, "lastSeen": "..."}` |

---

## 4. 💬 Detailed Event Handlers & Examples

### A. Join / Leave Conversation Screen
When a user enters a conversation screen in Flutter, join the conversation room so you receive focused updates:

```dart
// When opening chat screen:
socket!.emit('join_conversation', {'conversationId': conversationId});

// When leaving chat screen:
socket!.emit('leave_conversation', {'conversationId': conversationId});
```

---

### B. Receive Real-Time Messages (`new_message`)
Listen globally or inside your Chat Controller:

```dart
socket!.on('new_message', (data) {
  print('📩 New message received: $data');
  /*
  data format:
  {
    "id": "cm123...",
    "conversationId": "cm456...",
    "senderId": "cm789...",
    "content": "Hello there!",
    "type": "TEXT", // "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "FILE"
    "attachmentUrl": "https://res.cloudinary.com/.../file.png", // or null
    "isDeletedForEveryone": false,
    "isEdited": false,
    "createdAt": "2026-08-20T08:50:00.000Z",
    "updatedAt": "2026-08-20T08:50:00.000Z",
    "sender": {
      "id": "cm789...",
      "name": "John Doe",
      "avatar": "https://res.cloudinary.com/.../avatar.jpg"
    }
  }
  */
});
```

---

### C. Send Text Message (`send_message`)
```dart
void sendTextMessage({
  required String conversationId,
  required String text,
}) {
  socket!.emitWithAck(
    'send_message',
    {
      'conversationId': conversationId,
      'content': text,
      'type': 'TEXT',
    },
    ack: (response) {
      print('Message sent response: $response');
    },
  );
}
```

---

### D. Send Media Message (Image / Video / Audio / File)
For images, videos, audio, and documents, send a `multipart/form-data` request via **REST API**. The server automatically uploads to Cloudinary, saves to DB, and broadcasts `new_message` across Socket.IO!

```dart
import 'package:dio/dio.dart';

Future<void> sendMediaMessage({
  required String baseUrl,
  required String accessToken,
  required String conversationId,
  required String filePath,
  String? caption,
}) async {
  final dio = Dio();
  
  final formData = FormData.fromMap({
    if (caption != null && caption.isNotEmpty) 'content': caption,
    'file': await MultipartFile.fromFile(filePath),
  });

  final response = await dio.post(
    '$baseUrl/api/v1/chat/conversations/$conversationId/messages',
    data: formData,
    options: Options(
      headers: {
        'Authorization': 'Bearer $accessToken',
        'Content-Type': 'multipart/form-data',
      },
    ),
  );

  print('Media Message Sent: ${response.data}');
}
```

---

### E. Typing Indicators (`typing` / `user_typing`)

#### Emit typing when user is typing in TextField:
```dart
import 'dart:async';

Timer? _typingTimer;

void onTextChanged(String text, String conversationId) {
  // Start typing
  socket!.emit('typing', {
    'conversationId': conversationId,
    'isTyping': true,
  });

  // Debounce stop typing after 2 seconds of inactivity
  _typingTimer?.cancel();
  _typingTimer = Timer(const Duration(seconds: 2), () {
    socket!.emit('typing', {
      'conversationId': conversationId,
      'isTyping': false,
    });
  });
}
```

#### Listen for other user typing:
```dart
socket!.on('user_typing', (data) {
  /*
  data:
  {
    "conversationId": "cm123...",
    "userId": "cm456...",
    "userName": "Jane Doe",
    "isTyping": true // or false
  }
  */
  final isTyping = data['isTyping'] as bool;
  final userName = data['userName'] as String;
  print('$userName is ${isTyping ? "typing..." : "idle"}');
});
```

---

### F. Edit Message (`edit_message` / `message_edited`)

#### Emit Edit:
```dart
void editMessage({
  required String messageId,
  required String newContent,
}) {
  socket!.emit('edit_message', {
    'messageId': messageId,
    'content': newContent,
  });
}
```

#### Listen for Edit:
```dart
socket!.on('message_edited', (data) {
  print('Message Edited: $data');
  // Update the message in your UI state by data['id']
});
```

---

### G. Delete Message (`delete_message` / `message_deleted`)

#### Emit Delete:
```dart
// Delete for Me only:
socket!.emit('delete_message', {
  'messageId': messageId,
  'type': 'ME',
});

// Delete for Everyone:
socket!.emit('delete_message', {
  'messageId': messageId,
  'type': 'EVERYONE',
});
```

#### Listen for Delete:
```dart
socket!.on('message_deleted', (data) {
  /*
  data:
  {
    "messageId": "cm123...",
    "conversationId": "cm456...",
    "type": "EVERYONE" // or "ME"
  }
  */
  final deletedId = data['messageId'];
  final deleteType = data['type'];
  
  if (deleteType == 'EVERYONE') {
    // Show 'This message was deleted'
  } else {
    // Remove completely from current user's message list
  }
});
```

---

### H. Online / Offline Presence (`presence_update`)
Whenever a user logs in, connects, or disconnects, the server broadcasts `presence_update`:

```dart
socket!.on('presence_update', (data) {
  /*
  data:
  {
    "userId": "cm789...",
    "isOnline": true, // or false
    "lastSeen": "2026-08-20T08:55:00.000Z" // only present when isOnline is false
  }
  */
  final userId = data['userId'];
  final isOnline = data['isOnline'] as bool;
  print('User $userId is now ${isOnline ? "ONLINE 🟢" : "OFFLINE ⚪"}');
});
```

---

## 5. 🏗️ Complete Flutter Chat Socket Service Class (Ready to Copy)

Create a file `lib/services/chat_socket_service.dart`:

```dart
import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as IO;

class ChatSocketService {
  static final ChatSocketService _instance = ChatSocketService._internal();
  factory ChatSocketService() => _instance;
  ChatSocketService._internal();

  IO.Socket? _socket;
  bool get isConnected => _socket?.connected ?? false;

  // Stream Controllers for Reactive UI
  final _messageController = StreamController<Map<String, dynamic>>.broadcast();
  final _typingController = StreamController<Map<String, dynamic>>.broadcast();
  final _editedController = StreamController<Map<String, dynamic>>.broadcast();
  final _deletedController = StreamController<Map<String, dynamic>>.broadcast();
  final _presenceController = StreamController<Map<String, dynamic>>.broadcast();

  Stream<Map<String, dynamic>> get onNewMessage => _messageController.stream;
  Stream<Map<String, dynamic>> get onUserTyping => _typingController.stream;
  Stream<Map<String, dynamic>> get onMessageEdited => _editedController.stream;
  Stream<Map<String, dynamic>> get onMessageDeleted => _deletedController.stream;
  Stream<Map<String, dynamic>> get onPresenceUpdate => _presenceController.stream;

  void connect({required String serverUrl, required String accessToken}) {
    if (_socket != null && _socket!.connected) return;

    _socket = IO.io(
      serverUrl,
      IO.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .setAuth({'token': accessToken})
          .setExtraHeaders({'Authorization': 'Bearer $accessToken'})
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionAttempts(10)
          .build(),
    );

    _socket!.connect();

    _socket!.onConnect((_) {
      print('🟢 Connected to Chat Socket: ${_socket!.id}');
    });

    _socket!.onDisconnect((_) {
      print('🔴 Disconnected from Chat Socket');
    });

    _socket!.on('new_message', (data) {
      if (data is Map<String, dynamic>) _messageController.add(data);
    });

    _socket!.on('user_typing', (data) {
      if (data is Map<String, dynamic>) _typingController.add(data);
    });

    _socket!.on('message_edited', (data) {
      if (data is Map<String, dynamic>) _editedController.add(data);
    });

    _socket!.on('message_deleted', (data) {
      if (data is Map<String, dynamic>) _deletedController.add(data);
    });

    _socket!.on('presence_update', (data) {
      if (data is Map<String, dynamic>) _presenceController.add(data);
    });
  }

  void joinConversation(String conversationId) {
    _socket?.emit('join_conversation', {'conversationId': conversationId});
  }

  void leaveConversation(String conversationId) {
    _socket?.emit('leave_conversation', {'conversationId': conversationId});
  }

  void sendTextMessage({required String conversationId, required String content}) {
    _socket?.emit('send_message', {
      'conversationId': conversationId,
      'content': content,
      'type': 'TEXT',
    });
  }

  void sendTypingStatus({required String conversationId, required bool isTyping}) {
    _socket?.emit('typing', {
      'conversationId': conversationId,
      'isTyping': isTyping,
    });
  }

  void editMessage({required String messageId, required String content}) {
    _socket?.emit('edit_message', {
      'messageId': messageId,
      'content': content,
    });
  }

  void deleteMessage({required String messageId, required String type}) {
    _socket?.emit('delete_message', {
      'messageId': messageId,
      'type': type, // 'ME' or 'EVERYONE'
    });
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
  }
}
```

---

## 6. 🌐 REST API Endpoints Quick Reference (Also in Swagger `/docs`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/signup` | Register new user |
| `POST` | `/api/v1/auth/login` | Login and obtain tokens |
| `POST` | `/api/v1/auth/refresh-token` | Rotate access & refresh tokens |
| `POST` | `/api/v1/auth/logout` | Revoke session |
| `GET` | `/api/v1/auth/me` | Fetch authenticated user profile |
| `GET` | `/api/v1/users` | List users for contacts |
| `GET` | `/api/v1/users/search?q=` | Search users |
| `POST` | `/api/v1/users/avatar` | Upload profile avatar (`multipart/form-data`) |
| `POST` | `/api/v1/chat/conversations` | Start or get 1-to-1 conversation |
| `GET` | `/api/v1/chat/conversations` | List user's conversations with last message |
| `GET` | `/api/v1/chat/conversations/:id/messages` | Paginated message history |
| `POST` | `/api/v1/chat/conversations/:id/messages` | Send message with optional file attachment |
| `PATCH`| `/api/v1/chat/messages/:id` | Edit message |
| `DELETE`| `/api/v1/chat/messages/:id?type=ME\|EVERYONE` | Delete message |

---

## 7. 🚀 Interactive Swagger Docs
Open your browser at:
`http://localhost:3000/docs`
to view the interactive Swagger documentation and test REST endpoints.
