package email

import (
	"bytes"
	"fmt"
	"html/template"
	"log"
	"net/smtp"
	"os"
)

// Config holds email configuration
type Config struct {
	SMTPHost     string
	SMTPPort     string
	SMTPUsername string
	SMTPPassword string
	FromAddress  string
	FromName     string
	Enabled      bool
}

// Client handles email sending
type Client struct {
	config Config
}

// NewClient creates a new email client
func NewClient() *Client {
	config := Config{
		SMTPHost:     os.Getenv("SMTP_HOST"),
		SMTPPort:     os.Getenv("SMTP_PORT"),
		SMTPUsername: os.Getenv("SMTP_USERNAME"),
		SMTPPassword: os.Getenv("SMTP_PASSWORD"),
		FromAddress:  os.Getenv("SMTP_FROM_ADDRESS"),
		FromName:     os.Getenv("SMTP_FROM_NAME"),
		Enabled:      os.Getenv("EMAIL_ENABLED") == "true",
	}

	// Set defaults
	if config.SMTPPort == "" {
		config.SMTPPort = "587"
	}
	if config.FromName == "" {
		config.FromName = "CSEDU Platform"
	}
	if !config.Enabled {
		log.Println("Email notifications are DISABLED. Set EMAIL_ENABLED=true to enable.")
	}

	return &Client{config: config}
}

// EmailTemplate represents an email message
type EmailTemplate struct {
	To      string
	Subject string
	Body    string
	IsHTML  bool
}

// Send sends an email
func (c *Client) Send(email EmailTemplate) error {
	if !c.config.Enabled {
		log.Printf("Email NOT sent (disabled): To=%s, Subject=%s\n", email.To, email.Subject)
		return nil
	}

	// Build message
	var msg bytes.Buffer
	msg.WriteString(fmt.Sprintf("From: %s <%s>\r\n", c.config.FromName, c.config.FromAddress))
	msg.WriteString(fmt.Sprintf("To: %s\r\n", email.To))
	msg.WriteString(fmt.Sprintf("Subject: %s\r\n", email.Subject))
	if email.IsHTML {
		msg.WriteString("MIME-Version: 1.0\r\n")
		msg.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
	}
	msg.WriteString("\r\n")
	msg.WriteString(email.Body)

	// Auth
	auth := smtp.PlainAuth("", c.config.SMTPUsername, c.config.SMTPPassword, c.config.SMTPHost)

	// Send
	addr := fmt.Sprintf("%s:%s", c.config.SMTPHost, c.config.SMTPPort)
	err := smtp.SendMail(addr, auth, c.config.FromAddress, []string{email.To}, msg.Bytes())
	if err != nil {
		log.Printf("Failed to send email to %s: %v\n", email.To, err)
		return err
	}

	log.Printf("Email sent successfully: To=%s, Subject=%s\n", email.To, email.Subject)
	return nil
}

// SendOverdueNotification sends an overdue book notification
func (c *Client) SendOverdueNotification(toEmail, userName, bookTitle string, dueDate string, fineAmount float64) error {
	tmpl := `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #3b82f6; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f9fafb; padding: 30px; border-radius: 8px; margin: 20px 0; }
        .warning { background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; }
        .fine-amount { font-size: 24px; font-weight: bold; color: #ef4444; }
        .button { display: inline-block; background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📚 CSEDU Digital Library</h1>
        </div>
        <div class="content">
            <h2>Overdue Book Notification</h2>
            <p>Dear {{.UserName}},</p>
            <p>This is a reminder that the following book is overdue:</p>
            
            <div class="warning">
                <p><strong>Book:</strong> {{.BookTitle}}</p>
                <p><strong>Due Date:</strong> {{.DueDate}}</p>
                <p><strong>Current Fine:</strong> <span class="fine-amount">৳{{.FineAmount}}</span></p>
            </div>
            
            <p>Please return the book as soon as possible to avoid additional fines. Fines accumulate at ৳50 per day with a maximum of ৳500.</p>
            
            <a href="https://csedu-platform.example.com/dashboard" class="button">View My Loans</a>
        </div>
        <div class="footer">
            <p>Department of Computer Science and Engineering<br>
            University of Dhaka</p>
            <p>This is an automated message. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
`

	t, err := template.New("overdue").Parse(tmpl)
	if err != nil {
		return err
	}

	var body bytes.Buffer
	data := struct {
		UserName   string
		BookTitle  string
		DueDate    string
		FineAmount float64
	}{
		UserName:   userName,
		BookTitle:  bookTitle,
		DueDate:    dueDate,
		FineAmount: fineAmount,
	}

	if err := t.Execute(&body, data); err != nil {
		return err
	}

	return c.Send(EmailTemplate{
		To:      toEmail,
		Subject: fmt.Sprintf("Overdue Book: %s", bookTitle),
		Body:    body.String(),
		IsHTML:  true,
	})
}

// SendHoldAvailableNotification notifies user when their held book is available
func (c *Client) SendHoldAvailableNotification(toEmail, userName, bookTitle string) error {
	tmpl := `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #10b981; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f0fdf4; padding: 30px; border-radius: 8px; margin: 20px 0; }
        .highlight { background-color: #d1fae5; padding: 15px; border-radius: 6px; margin: 20px 0; }
        .button { display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Your Book is Ready!</h1>
        </div>
        <div class="content">
            <h2>Hold Available Notification</h2>
            <p>Dear {{.UserName}},</p>
            <p>Great news! The book you placed on hold is now available for pickup.</p>
            
            <div class="highlight">
                <p><strong>Book:</strong> {{.BookTitle}}</p>
                <p><strong>Status:</strong> Ready for checkout</p>
            </div>
            
            <p>Please visit the library to check out this book at your earliest convenience. The hold will expire in 48 hours.</p>
            
            <a href="https://csedu-platform.example.com/dashboard" class="button">View My Holds</a>
        </div>
        <div class="footer">
            <p>Department of Computer Science and Engineering<br>
            University of Dhaka</p>
            <p>This is an automated message. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
`

	t, err := template.New("hold").Parse(tmpl)
	if err != nil {
		return err
	}

	var body bytes.Buffer
	data := struct {
		UserName  string
		BookTitle string
	}{
		UserName:  userName,
		BookTitle: bookTitle,
	}

	if err := t.Execute(&body, data); err != nil {
		return err
	}

	return c.Send(EmailTemplate{
		To:      toEmail,
		Subject: fmt.Sprintf("Book Available: %s", bookTitle),
		Body:    body.String(),
		IsHTML:  true,
	})
}

// SendResearchReviewNotification notifies researcher when their paper is reviewed
func (c *Client) SendResearchReviewNotification(toEmail, userName, paperTitle, status, reviewNotes string) error {
	statusColor := map[string]string{
		"published": "#10b981",
		"rejected":  "#ef4444",
		"revision":  "#f59e0b",
	}
	color := statusColor[status]
	if color == "" {
		color = "#6b7280"
	}

	tmpl := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: %s; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f9fafb; padding: 30px; border-radius: 8px; margin: 20px 0; }
        .review-box { background-color: white; padding: 15px; border-left: 4px solid %s; margin: 20px 0; }
        .button { display: inline-block; background-color: %s; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📄 Research Paper Review</h1>
        </div>
        <div class="content">
            <h2>Review Completed</h2>
            <p>Dear {{.UserName}},</p>
            <p>Your research paper has been reviewed:</p>
            
            <div class="review-box">
                <p><strong>Paper:</strong> {{.PaperTitle}}</p>
                <p><strong>Status:</strong> {{.Status}}</p>
                {{if .ReviewNotes}}
                <p><strong>Review Notes:</strong></p>
                <p>{{.ReviewNotes}}</p>
                {{end}}
            </div>
            
            <a href="https://csedu-platform.example.com/research" class="button">View My Research</a>
        </div>
        <div class="footer">
            <p>Department of Computer Science and Engineering<br>
            University of Dhaka</p>
            <p>This is an automated message. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
`, color, color, color)

	t, err := template.New("review").Parse(tmpl)
	if err != nil {
		return err
	}

	var body bytes.Buffer
	data := struct {
		UserName    string
		PaperTitle  string
		Status      string
		ReviewNotes string
	}{
		UserName:    userName,
		PaperTitle:  paperTitle,
		Status:      status,
		ReviewNotes: reviewNotes,
	}

	if err := t.Execute(&body, data); err != nil {
		return err
	}

	return c.Send(EmailTemplate{
		To:      toEmail,
		Subject: fmt.Sprintf("Research Review: %s - %s", paperTitle, status),
		Body:    body.String(),
		IsHTML:  true,
	})
}

// SendWelcomeEmail sends a welcome email to new users
func (c *Client) SendWelcomeEmail(toEmail, userName string) error {
	tmpl := `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #3b82f6; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f9fafb; padding: 30px; border-radius: 8px; margin: 20px 0; }
        .features { display: flex; flex-wrap: wrap; gap: 20px; margin: 20px 0; }
        .feature { flex: 1; min-width: 200px; background: white; padding: 15px; border-radius: 6px; }
        .button { display: inline-block; background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 30px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Welcome to CSEDU Platform!</h1>
        </div>
        <div class="content">
            <h2>Welcome, {{.UserName}}!</h2>
            <p>Thank you for joining the CSEDU Digital Knowledge Platform. You now have access to a wealth of academic resources and tools.</p>
            
            <div class="features">
                <div class="feature">
                    <h3>📚 Digital Library</h3>
                    <p>Browse and borrow books from our extensive catalog</p>
                </div>
                <div class="feature">
                    <h3>📄 Research Repository</h3>
                    <p>Access and publish research papers</p>
                </div>
                <div class="feature">
                    <h3>🎓 Student Projects</h3>
                    <p>Showcase your projects and explore others' work</p>
                </div>
                <div class="feature">
                    <h3>🤖 AI Assistant</h3>
                    <p>Get intelligent answers about our resources</p>
                </div>
            </div>
            
            <a href="https://csedu-platform.example.com/dashboard" class="button">Get Started</a>
        </div>
        <div class="footer">
            <p>Department of Computer Science and Engineering<br>
            University of Dhaka</p>
            <p>Need help? Contact support@cs.du.ac.bd</p>
        </div>
    </div>
</body>
</html>
`

	t, err := template.New("welcome").Parse(tmpl)
	if err != nil {
		return err
	}

	var body bytes.Buffer
	data := struct {
		UserName string
	}{
		UserName: userName,
	}

	if err := t.Execute(&body, data); err != nil {
		return err
	}

	return c.Send(EmailTemplate{
		To:      toEmail,
		Subject: "Welcome to CSEDU Digital Knowledge Platform",
		Body:    body.String(),
		IsHTML:  true,
	})
}
