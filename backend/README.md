# Backend

The backend is built with Golang and the Echo framework. This is a pretty lightweight backend as it's main purpose is generating and serving CDN urls that store city data.

## Development & Installation

1. Create an Amazon S3 and IAM account and create access/secret keys. Put those keys in a .env.local file as NEXT_ACCESS_KEY and NEXT_SECRET_KEY. Afterwards, run the following build commands.

```
AWS_ACCESS_KEY=""
AWS_SECRET_ACCESS_KEY=""
AWS_REGION="" // e.g. us-east-1
S3_BUCKET_NAME=""
FRONTEND_ORIGIN="" // e.g. http://localhost:5173
AWS_CLOUDFRONT_DOMAIN=""    // e.g. d1234.cloudfront.net
```

2. Run `go run main.go`
