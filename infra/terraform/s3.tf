resource "aws_s3_bucket" "part_images" {
  bucket = "${var.project_name}-part-images-${random_id.suffix.hex}"

  tags = {
    Name = "${var.project_name}-part-images"
  }
}

resource "random_id" "suffix" {
  byte_length = 4
}

# Allow public access to the bucket
resource "aws_s3_bucket_public_access_block" "part_images" {
  bucket = aws_s3_bucket.part_images.id

  block_public_acls       = false
  block_public_policy      = false
  ignore_public_acls       = false
  restrict_public_buckets  = false
}

# Public read policy — anyone can read uploaded part images
resource "aws_s3_bucket_policy" "part_images_public_read" {
  bucket = aws_s3_bucket.part_images.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.part_images.arn}/*"
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.part_images]
}