package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"github.com/jaedonspurlock01/routify-updated/internal/models"
	"github.com/jaedonspurlock01/routify-updated/internal_config"
)

func SaveOverpassToS3(ctx context.Context, osm_id int64, data models.ParsedOverpass) (string, error) {
	cfg := internal_config.LoadConfig()

	awsCfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion(cfg.AWSRegion),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			cfg.AWSAccessKey,
			cfg.AWSSecretAccessKey,
			"",
		)),
	)

	if err != nil {
		return "", err
	}

	s3Client := s3.NewFromConfig(awsCfg)

	var builder strings.Builder

	for _, node := range data.Nodes {
		obj := map[string]any{
			"type": "node",
			"id":   node.ID,
			"lat":  node.Lat,
			"lon":  node.Lon,
		}
		line, _ := json.Marshal(obj)
		builder.Write(line)
		builder.WriteString("\n")
	}

	for _, way := range data.Ways {
		obj := map[string]any{
			"type": "way",
			"ids":  way.IDs,
		}
		line, _ := json.Marshal(obj)
		builder.Write(line)
		builder.WriteString("\n")
	}

	body := bytes.NewReader([]byte(builder.String()))

	key := fmt.Sprintf("%d.ndjson", osm_id)

	_, err = s3Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(cfg.S3BucketName),
		Key:         aws.String(key),
		Body:        body,
		ContentType: aws.String("application/x-ndjson"),
	})

	if err != nil {
		return "", fmt.Errorf("failed to upload NDJSON to S3: %w", err)
	}

	url := fmt.Sprintf("https://%s/%d", cfg.AWSCloudfrontDomain, osm_id)
	return url, nil
}

func CheckOverpassInS3(ctx context.Context, osm_id int64) (bool, error) {
	cfg := internal_config.LoadConfig()

	awsCfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion(cfg.AWSRegion),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			cfg.AWSAccessKey,
			cfg.AWSSecretAccessKey,
			"",
		)),
	)

	if err != nil {
		return false, err
	}

	s3Client := s3.NewFromConfig(awsCfg)

	key := fmt.Sprintf("%d.ndjson", osm_id)

	_, err = s3Client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(cfg.S3BucketName),
		Key:    aws.String(key),
	})

	if err != nil {
		return false, nil
	}

	return true, nil
}
