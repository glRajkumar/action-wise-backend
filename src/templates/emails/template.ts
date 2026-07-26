type props = {
  headStyle?: string
  content: string
}

export function template({ headStyle, content }: props) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SD Matrimony</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f8fafc;
    }
    .container {
      max-width: 600px;
      margin: 16px auto;
      background-color: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #fda6b2 0%, #f970b3 100%);
      padding: 40px 30px;
      text-align: center;
      color: white;
    }
    .logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 12px;
      background: linear-gradient(135deg, #fb7185 0%, #ec4899 100%);
      border-radius: 50%;
      margin-bottom: 20px;
      box-shadow: 0 4px 12px rgba(236, 72, 153, 0.3);
      width: 60px;
      height: 60px;
    }
    .header h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .header p {
      font-size: 16px;
      opacity: 0.9;
    }
    .content {
      padding: 40px 30px;
    }
    .features {
      background-color: #f9fafb;
      border-radius: 8px;
      padding: 24px;
      margin: 30px 0;
    }
    .features h3 {
      color: #1f2937;
      font-size: 18px;
      margin-bottom: 16px;
      font-weight: 600;
    }
    .features ul {
      list-style: none;
    }
    .features li {
      color: #6b7280;
      margin-bottom: 8px;
      position: relative;
      padding-left: 24px;
    }
    .features li::before {
      content: "✓";
      position: absolute;
      left: 0;
      color: #ec4899;
      font-weight: bold;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #fb7185 0%, #ec4899 100%);
      color: white;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      margin: 20px 0;
      transition: color 0.2s ease;
    }
    .cta-button:hover {
      background: #f21c86;
    }
    .footer {
      background-color: #f9fafb;
      padding: 30px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
    }
    .contact-info {
      margin-bottom: 20px;
    }
    .contact-info h4 {
      color: #1f2937;
      font-size: 16px;
      margin-bottom: 12px;
      font-weight: 600;
    }
    .contact-details {
      color: #6b7280;
      font-size: 14px;
      line-height: 1.8;
    }
    a {
      color: #ec4899;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
      color: #cc2176;
    }
    .social-note {
      color: #9ca3af;
      font-size: 12px;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
    }
    ${headStyle}
    @media (max-width: 600px) {
      .container {
        margin: 10px;
        border-radius: 8px;
      }
      .header,
      .content,
      .footer {
        padding: 20px;
      }
      .header h1 {
        font-size: 24px;
      }
      .welcome-message h2 {
        font-size: 20px;
      }
    }
  </style>
</head>

<body>
  <div class="container">
    <div class="header">
      <div class="logo">
        <span style="font-size: 24px; color: white;">Logo</span>
      </div>
    </div>

    <div class="content">
     ${content}
    </div>

    <div class="footer">
      <div class="contact-info">
        <h4>Get in Touch</h4>
      </div>
    </div>
  </div>
</body>
</html>
  `
}
