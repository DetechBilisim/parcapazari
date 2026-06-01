resource "aws_db_instance" "postgres" {
  identifier             = "${var.project_name}-db"
  engine                 = "postgres"
  engine_version         = "15"
  instance_class         = "db.t3.micro"
  allocated_storage      = 20
  storage_type           = "gp2"

  db_name                = "parcapazari_dev"
  username               = var.db_username
  password               = var.db_password

  vpc_security_group_ids = [aws_security_group.db.id]

  publicly_accessible    = true
  skip_final_snapshot    = true

  # No encryption at rest
  storage_encrypted      = false

  # No automated backups
  backup_retention_period = 0

  tags = {
    Name = "${var.project_name}-db"
  }
}