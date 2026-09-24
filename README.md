A smart reminder service that leverages an LLM to manage user reminders and proactively remind them at optimal times based on context and preferences.

## Features
- **Reminder Management**: Create, update, and delete reminders using natural language.
- **Proactive Reminders**: The service analyzes user behavior and context to send reminders at optimal times.
- **Contextual Awareness**: Takes into account factors like user activity, device usage, and time patterns to decide when to remind.

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- MongoDB

### Installation
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd smart-reminder
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory with the following variables:
   ```env
   # MongoDB configuration
   MONGO_URI=mongodb://localhost:27017/smart-reminder
   
   # AI configuration
   GEMINI_API_KEY=your-gemini-api-key
   ```

### Running the Server
1. Start the development server:
   ```bash
   npm run dev
   ```
   
2. The server will start on `http://localhost:3000`

## API Reference

### Create a Reminder
```http
POST /api/reminders
```

**Request Body:**
```json
{
  "title": "Meeting with John",
  "description": "Discuss project requirements",
  "time": "2024-12-01T10:00:00",
  "metadata": {}
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "title": "Meeting with John",
    "description": "Discuss project requirements",
    "time": "2024-12-01T10:00:00",
    "metadata": {},
    "status": "pending",
    "createdAt": "2024-11-25T12:34:56.789Z",
    "updatedAt": "2024-11-25T12:34:56.789Z"
  }
}
```

### Get All Reminders
```http
GET /api/reminders
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "title": "Meeting with John",
      "description": "Discuss project requirements",
      "time": "2024-12-01T10:00:00",
      "metadata": {},
      "status": "pending",
      "createdAt": "2024-11-25T12:34:56.789Z",
      "updatedAt": "2024-11-25T12:34:56.789Z"
    }
  ]
}
```

### Get Reminder by ID
```http
GET /api/reminders/:id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "title": "Meeting with John",
    "description": "Discuss project requirements",
    "time": "2024-12-01T10:00:00",
    "metadata": {},
    "status": "pending",
    "createdAt": "2024-11-25T12:34:56.789Z",
    "updatedAt": "2024-11-25T12:34:56.789Z"
  }
}
```

### Update Reminder
```http
PUT /api/reminders/:id
```

**Request Body:**
```json
{
  "description": "Updated project requirements discussion",
  "time": "2024-12-02T11:00:00"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "title": "Meeting with John",
    "description": "Updated project requirements discussion",
    "time": "2024-12-02T11:00:00",
    "metadata": {},
    "status": "pending",
    "createdAt": "2024-11-25T12:34:56.789Z",
    "updatedAt": "2024-11-25T12:45:00.123Z"
  }
}
```

### Delete Reminder
```http
DELETE /api/reminders/:id
```

**Response:**
```json
{
  "success": true,
  "message": "Reminder deleted successfully"
}
```

## Architecture

The application follows a modular architecture with separation of concerns:

```
smart-reminder/
├── src/
│   ├── config/
│   │   └── db.js         # Database configuration and connection
│   ├── models/
│   │   └── reminder.model.js # Reminder Mongoose schema
│   ├── services/
│   │   ├── reminder.service.js # Business logic for reminders
│   │   └── ai.service.js     # AI integration for smart suggestions
│   ├── controllers/
│   │   └── reminder.controller.js # HTTP request handlers
│   ├── routes/
│   │   └── reminder.routes.js # API route definitions
│   └── app.js            # Express application setup
├── .env                    # Environment variables (not in git)
├── package.json
└── README.md
```

## Technologies Used
- [Express.js](https://expressjs.com/) - Web framework for Node.js
- [Mongoose](https://mongoosejs.com/) - MongoDB object modeling
- [Google Generative AI SDK](https://ai.google.dev/gemini-api/docs) - AI capabilities

## Development

### Adding New Features
When adding new features, follow these guidelines:
1. Create a new service in `src/services/` for the new functionality
2. Add appropriate Mongoose models in `src/models/` if needed
3. Create controller functions in `src/controllers/`
4. Define routes in `src/routes/`
5. Update `src/app.js` to register the new routes

### Testing
To run the test suite (when available):
```bash
npm test
```

## Contributing
Please read [CONTRIBUTING.md](CONTRIBUTING.md) (if available) for details on our code of conduct, and the process for submitting pull requests.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
